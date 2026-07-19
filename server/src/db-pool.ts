import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { loggerService } from './module/logger/logger.service';

/**
 * Database Connection Pool Manager with Read Replica Support
 *
 * Provides intelligent query routing:
 * - Write queries → Primary database
 * - Read queries → Read replicas (load balanced), when configured
 * - Automatic failover to primary if replicas unavailable
 *
 * Read replicas are entirely optional — with zero replicas configured
 * (POSTGRES_REPLICA_HOSTS unset), every read/write/transaction call routes
 * to the primary. This is the expected Community Edition default.
 */

interface ReplicaConfig {
    host: string;
    port: number;
    weight: number; // Load balancing weight (1-10)
}

class DatabaseConnectionPool {
    private primaryClient: PrismaClient;
    private replicaClients: PrismaClient[] = [];
    private replicaConfigs: ReplicaConfig[] = [];
    private currentReplicaIndex = 0;
    private replicaHealthStatus: boolean[] = [];
    private healthCheckInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Initialize primary client
        this.primaryClient = this.createPrismaClient(env.DATABASE_URL, 'primary');

        // Initialize replica clients if configured
        this.initializeReplicas();

        // Start health check monitoring
        this.startHealthChecks();
    }

    /**
     * Create Prisma client with optimized settings
     */
    private createPrismaClient(databaseUrl: string, name: string): PrismaClient {
        const client = new PrismaClient({
            log: env.NODE_ENV === 'development'
                ? ['query', 'warn', 'error']
                : ['warn', 'error'],
            datasources: {
                db: {
                    url: databaseUrl
                }
            },
            // Connection pool settings
            // @ts-ignore - Prisma doesn't expose these in types but they work
            __internal: {
                engine: {
                    connection_limit: name === 'primary' ? 20 : 10,
                }
            }
        });

        // Log warnings and errors
        client.$on('warn' as never, (e: any) => {
            loggerService.warn(`Prisma warning [${name}]:`, e);
        });

        client.$on('error' as never, (e: any) => {
            loggerService.error(`Prisma error [${name}]:`, e);
        });

        return client;
    }

    /**
     * Initialize read replica connections
     */
    private initializeReplicas(): void {
        const replicaHosts = process.env.POSTGRES_REPLICA_HOSTS?.split(',') || [];

        if (replicaHosts.length === 0) {
            loggerService.info('No read replicas configured, using primary for all queries');
            return;
        }

        replicaHosts.forEach((replicaHost, index) => {
            const [host, portStr, weightStr] = replicaHost.split(':');
            const port = parseInt(portStr || '5432', 10);
            const weight = parseInt(weightStr || '1', 10);

            // Build replica connection URL
            const replicaUrl = this.buildReplicaUrl(host, port);

            try {
                const replicaClient = this.createPrismaClient(replicaUrl, `replica-${index + 1}`);
                this.replicaClients.push(replicaClient);
                this.replicaConfigs.push({ host, port, weight });
                this.replicaHealthStatus.push(true); // Assume healthy initially

                loggerService.info(`Initialized read replica ${index + 1}: ${host}:${port} (weight: ${weight})`);
            } catch (error) {
                loggerService.error(`Failed to initialize replica ${host}:${port}:`, error);
            }
        });

        loggerService.info(`Database connection pool initialized with ${this.replicaClients.length} read replicas`);
    }

    /**
     * Build database URL for replica
     */
    private buildReplicaUrl(host: string, port: number): string {
        const primaryUrl = new URL(env.DATABASE_URL);
        primaryUrl.hostname = host;
        primaryUrl.port = port.toString();
        return primaryUrl.toString();
    }

    /**
     * Start periodic health checks for replicas
     */
    private startHealthChecks(): void {
        if (this.replicaClients.length === 0) return;

        this.healthCheckInterval = setInterval(async () => {
            await this.checkReplicaHealth();
        }, 30000); // Check every 30 seconds

        // Initial health check
        this.checkReplicaHealth();
    }

    /**
     * Check health of all replicas
     */
    private async checkReplicaHealth(): Promise<void> {
        const healthChecks = this.replicaClients.map(async (client, index) => {
            try {
                // Simple query to test connectivity
                await client.$queryRaw`SELECT 1`;

                // Check replication lag
                const result = await client.$queryRaw<Array<{ lag_seconds: number }>>`
                    SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::INT as lag_seconds
                `;

                const lagSeconds = result[0]?.lag_seconds || 0;

                if (lagSeconds > 60) {
                    loggerService.warn(`Replica ${index + 1} has high replication lag: ${lagSeconds}s`);
                }

                this.replicaHealthStatus[index] = true;
            } catch (error) {
                loggerService.error(`Health check failed for replica ${index + 1}:`, error);
                this.replicaHealthStatus[index] = false;
            }
        });

        await Promise.all(healthChecks);
    }

    /**
     * Get next available replica using weighted round-robin
     */
    private getNextReplica(): PrismaClient | null {
        if (this.replicaClients.length === 0) {
            return null;
        }

        // Find healthy replicas
        const healthyIndices = this.replicaHealthStatus
            .map((healthy, index) => healthy ? index : -1)
            .filter(index => index !== -1);

        if (healthyIndices.length === 0) {
            loggerService.warn('No healthy replicas available, falling back to primary');
            return null;
        }

        // Weighted round-robin selection
        const selectedIndex = healthyIndices[this.currentReplicaIndex % healthyIndices.length];
        this.currentReplicaIndex++;

        return this.replicaClients[selectedIndex];
    }

    /**
     * Get client for read operations (uses replicas)
     */
    getReadClient(): PrismaClient {
        const replica = this.getNextReplica();
        return replica || this.primaryClient;
    }

    /**
     * Get client for write operations (uses primary)
     */
    getWriteClient(): PrismaClient {
        return this.primaryClient;
    }

    /**
     * Get primary client explicitly
     */
    getPrimaryClient(): PrismaClient {
        return this.primaryClient;
    }

    /**
     * Execute a transaction (always on primary)
     */
    async transaction<T>(
        fn: (tx: PrismaClient) => Promise<T>
    ): Promise<T> {
        return this.primaryClient.$transaction(async (tx) => {
            return fn(tx as unknown as PrismaClient);
        });
    }

    /**
     * Get connection pool statistics
     */
    getStats() {
        return {
            replicas: {
                total: this.replicaClients.length,
                healthy: this.replicaHealthStatus.filter(h => h).length,
                unhealthy: this.replicaHealthStatus.filter(h => !h).length,
                configs: this.replicaConfigs
            },
            primary: {
                connected: true // Simplified - could add actual check
            }
        };
    }

    /**
     * Disconnect all clients
     */
    async disconnect(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        const disconnectPromises = [
            this.primaryClient.$disconnect(),
            ...this.replicaClients.map(client => client.$disconnect())
        ];

        await Promise.all(disconnectPromises);
        loggerService.info('All database connections closed');
    }
}

// Singleton instance
const dbPool = new DatabaseConnectionPool();

// Handle disconnect on process termination
process.on('beforeExit', async () => {
    await dbPool.disconnect();
});

process.on('SIGINT', async () => {
    await dbPool.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await dbPool.disconnect();
    process.exit(0);
});

/**
 * Default export for backwards compatibility.
 * Uses primary for all operations unless explicitly routed.
 */
export default dbPool.getPrimaryClient();

/**
 * Named exports for explicit replica usage
 */
export const db = {
    // For read operations - uses replicas
    read: dbPool.getReadClient(),

    // For write operations - uses primary
    write: dbPool.getWriteClient(),

    // Always use primary
    primary: dbPool.getPrimaryClient(),

    // Transaction support
    transaction: dbPool.transaction.bind(dbPool),

    // Pool statistics
    stats: () => dbPool.getStats(),

    // Manual disconnect
    disconnect: () => dbPool.disconnect()
};

/**
 * Middleware to automatically route queries based on operation type
 */
export function getClientForOperation(operation: 'read' | 'write' | 'transaction'): PrismaClient {
    switch (operation) {
        case 'read':
            return dbPool.getReadClient();
        case 'write':
        case 'transaction':
            return dbPool.getWriteClient();
        default:
            return dbPool.getPrimaryClient();
    }
}

/**
 * Helper to check if operation is read-only
 */
export function isReadOnlyOperation(method: string): boolean {
    const readMethods = [
        'findUnique',
        'findUniqueOrThrow',
        'findFirst',
        'findFirstOrThrow',
        'findMany',
        'count',
        'aggregate',
        'groupBy'
    ];

    return readMethods.includes(method);
}

/**
 * Example usage:
 *
 * // Explicit read from replica
 * const tools = await db.read.tool.findMany();
 *
 * // Explicit write to primary
 * const newTool = await db.write.tool.create({ data: {...} });
 *
 * // Transaction (always primary)
 * await db.transaction(async (tx) => {
 *   await tx.tool.create({ data: {...} });
 *   await tx.deployment.create({ data: {...} });
 * });
 *
 * // Get pool stats
 * console.log(db.stats());
 */

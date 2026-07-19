import { PrismaClient } from '@prisma/client';
import { env } from './config/env';
import { loggerService } from './module/logger/logger.service';

// Configure Prisma with connection pooling and logging
const prisma = new PrismaClient({
    log: env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
    datasources: {
        db: {
            url: env.DATABASE_URL
        }
    }
});

// Log query warnings and errors in production
if (env.NODE_ENV === 'production') {
    prisma.$on('warn' as never, (e: any) => {
        loggerService.warn('Prisma warning:', e);
    });

    prisma.$on('error' as never, (e: any) => {
        loggerService.error('Prisma error:', e);
    });
}

// Handle disconnect on process termination
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma;

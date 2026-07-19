/**
 * Deployment WebSocket Events
 * 
 * Real-time deployment status updates via WebSocket.
 */

import type { WebSocketServer } from '../lib/websocket-server';

export enum DeploymentStatus {
  QUEUED = 'queued',
  BUILDING = 'building',
  DEPLOYING = 'deploying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum DeploymentEventType {
  STATUS_CHANGED = 'deployment:status',
  PROGRESS_UPDATE = 'deployment:progress',
  LOG_ENTRY = 'deployment:log',
  ERROR = 'deployment:error',
  COMPLETED = 'deployment:completed',
  FAILED = 'deployment:failed'
}

interface DeploymentEvent {
  deploymentId: string;
  tenantId: string;
  userId: string;
  status: DeploymentStatus;
  message?: string;
  progress?: number; // 0-100
  timestamp: number;
  metadata?: Record<string, any>;
}

interface DeploymentLogEntry {
  deploymentId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export class DeploymentEventsManager {
  private wsServer: WebSocketServer;
  private deploymentProgress: Map<string, number> = new Map();
  private deploymentStatus: Map<string, DeploymentStatus> = new Map();

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Emit deployment status change
   */
  emitStatusChange(event: DeploymentEvent): void {
    const { deploymentId, tenantId, status, message, progress, metadata } = event;

    // Update internal state
    this.deploymentStatus.set(deploymentId, status);
    if (progress !== undefined) {
      this.deploymentProgress.set(deploymentId, progress);
    }

    const payload = {
      deploymentId,
      status,
      message,
      progress: progress ?? this.deploymentProgress.get(deploymentId) ?? 0,
      timestamp: Date.now(),
      metadata
    };

    // Emit to deployment room
    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.STATUS_CHANGED, payload);

    // Emit to tenant room
    this.wsServer.emitToTenant(tenantId, DeploymentEventType.STATUS_CHANGED, payload);

    // Emit to user
    this.wsServer.emitToUser(event.userId, DeploymentEventType.STATUS_CHANGED, payload);
  }

  /**
   * Emit deployment progress update
   */
  emitProgressUpdate(deploymentId: string, tenantId: string, userId: string, progress: number, message?: string): void {
    this.deploymentProgress.set(deploymentId, progress);

    const payload = {
      deploymentId,
      progress,
      message,
      timestamp: Date.now()
    };

    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.PROGRESS_UPDATE, payload);
    this.wsServer.emitToTenant(tenantId, DeploymentEventType.PROGRESS_UPDATE, payload);
    this.wsServer.emitToUser(userId, DeploymentEventType.PROGRESS_UPDATE, payload);
  }

  /**
   * Emit deployment log entry
   */
  emitLogEntry(deploymentId: string, tenantId: string, log: DeploymentLogEntry): void {
    const payload = {
      ...log,
      timestamp: Date.now()
    };

    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.LOG_ENTRY, payload);

    // Only emit errors and warnings to tenant room
    if (log.level === 'error' || log.level === 'warn') {
      this.wsServer.emitToTenant(tenantId, DeploymentEventType.LOG_ENTRY, payload);
    }
  }

  /**
   * Emit deployment error
   */
  emitError(deploymentId: string, tenantId: string, userId: string, error: Error | string, metadata?: Record<string, any>): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    const payload = {
      deploymentId,
      error: errorMessage,
      stack: errorStack,
      timestamp: Date.now(),
      metadata
    };

    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.ERROR, payload);
    this.wsServer.emitToTenant(tenantId, DeploymentEventType.ERROR, payload);
    this.wsServer.emitToUser(userId, DeploymentEventType.ERROR, payload);

    // Update status to failed
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.FAILED,
      message: errorMessage,
      timestamp: Date.now(),
      metadata
    });
  }

  /**
   * Emit deployment completed
   */
  emitCompleted(deploymentId: string, tenantId: string, userId: string, message?: string, metadata?: Record<string, any>): void {
    const payload = {
      deploymentId,
      message: message || 'Deployment completed successfully',
      timestamp: Date.now(),
      metadata
    };

    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.COMPLETED, payload);
    this.wsServer.emitToTenant(tenantId, DeploymentEventType.COMPLETED, payload);
    this.wsServer.emitToUser(userId, DeploymentEventType.COMPLETED, payload);

    // Update status
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.COMPLETED,
      message,
      progress: 100,
      timestamp: Date.now(),
      metadata
    });

    // Clean up
    this.cleanupDeployment(deploymentId);
  }

  /**
   * Emit deployment failed
   */
  emitFailed(deploymentId: string, tenantId: string, userId: string, reason: string, metadata?: Record<string, any>): void {
    const payload = {
      deploymentId,
      reason,
      timestamp: Date.now(),
      metadata
    };

    this.wsServer.emitToRoom(`deployment:${deploymentId}`, DeploymentEventType.FAILED, payload);
    this.wsServer.emitToTenant(tenantId, DeploymentEventType.FAILED, payload);
    this.wsServer.emitToUser(userId, DeploymentEventType.FAILED, payload);

    // Update status
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.FAILED,
      message: reason,
      timestamp: Date.now(),
      metadata
    });

    // Clean up
    this.cleanupDeployment(deploymentId);
  }

  /**
   * Emit deployment queued
   */
  emitQueued(deploymentId: string, tenantId: string, userId: string, position?: number): void {
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.QUEUED,
      message: position ? `Queued at position ${position}` : 'Deployment queued',
      progress: 0,
      timestamp: Date.now(),
      metadata: { position }
    });
  }

  /**
   * Emit deployment building
   */
  emitBuilding(deploymentId: string, tenantId: string, userId: string, message?: string): void {
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.BUILDING,
      message: message || 'Building deployment',
      progress: 25,
      timestamp: Date.now()
    });
  }

  /**
   * Emit deployment deploying
   */
  emitDeploying(deploymentId: string, tenantId: string, userId: string, message?: string): void {
    this.emitStatusChange({
      deploymentId,
      tenantId,
      userId,
      status: DeploymentStatus.DEPLOYING,
      message: message || 'Deploying to infrastructure',
      progress: 50,
      timestamp: Date.now()
    });
  }

  /**
   * Get current deployment status
   */
  getDeploymentStatus(deploymentId: string): DeploymentStatus | undefined {
    return this.deploymentStatus.get(deploymentId);
  }

  /**
   * Get current deployment progress
   */
  getDeploymentProgress(deploymentId: string): number {
    return this.deploymentProgress.get(deploymentId) ?? 0;
  }

  /**
   * Clean up deployment tracking
   */
  private cleanupDeployment(deploymentId: string): void {
    // Keep status for 5 minutes after completion
    setTimeout(() => {
      this.deploymentStatus.delete(deploymentId);
      this.deploymentProgress.delete(deploymentId);
    }, 5 * 60 * 1000);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeDeployments: number;
    deploymentsByStatus: Record<DeploymentStatus, number>;
  } {
    const deploymentsByStatus: Record<DeploymentStatus, number> = {
      [DeploymentStatus.QUEUED]: 0,
      [DeploymentStatus.BUILDING]: 0,
      [DeploymentStatus.DEPLOYING]: 0,
      [DeploymentStatus.COMPLETED]: 0,
      [DeploymentStatus.FAILED]: 0,
      [DeploymentStatus.CANCELLED]: 0
    };

    for (const status of this.deploymentStatus.values()) {
      deploymentsByStatus[status]++;
    }

    return {
      activeDeployments: this.deploymentStatus.size,
      deploymentsByStatus
    };
  }
}

export default DeploymentEventsManager;

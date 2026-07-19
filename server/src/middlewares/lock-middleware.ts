/**
 * Lock Middleware
 *
 * Fastify middleware for automatic lock management on routes.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { DistributedLock } from '../lib/distributed-lock';

interface LockMiddlewareOptions {
  lockManager: DistributedLock;
  resourceGenerator: (request: FastifyRequest) => string;
  ttl?: number;
  retryCount?: number;
  retryDelay?: number;
  onLockFailed?: (request: FastifyRequest, reply: FastifyReply) => void;
}

/**
 * Create middleware that acquires a lock before processing the request
 */
export function createLockMiddleware(options: LockMiddlewareOptions) {
  const {
    lockManager,
    resourceGenerator,
    ttl = 30000,
    retryCount = 3,
    retryDelay = 200,
    onLockFailed
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const resource = resourceGenerator(request);

    try {
      const lock = await lockManager.acquire(resource, {
        ttl,
        retryCount,
        retryDelay
      });

      if (!lock) {
        if (onLockFailed) {
          onLockFailed(request, reply);
        } else {
          reply.code(409).send({
            error: 'Resource is locked',
            message: 'Another operation is in progress for this resource',
            resource
          });
        }
        return;
      }

      // Attach lock to request for cleanup
      (request as any).distributedLock = lock;

      // Set up cleanup on response
      reply.addHook('onSend', async () => {
        await lockManager.release(lock);
      });
    } catch (error) {
      console.error('Lock acquisition error:', error);
      reply.code(500).send({
        error: 'Failed to acquire lock'
      });
    }
  };
}

/**
 * Common lock resource generators
 */
export const LockResourceGenerators = {
  /**
   * Lock by deployment ID
   */
  deployment: (request: FastifyRequest) => {
    const { deploymentId } = request.params as { deploymentId: string };
    return `deployment:${deploymentId}`;
  },

  /**
   * Lock by tenant ID
   */
  tenant: (request: FastifyRequest) => {
    const { tenantId } = request.params as { tenantId?: string };
    const sessionTenantId = (request as any).session?.tenantId;
    const id = tenantId || sessionTenantId;
    return `tenant:${id}`;
  },

  /**
   * Lock by user ID
   */
  user: (request: FastifyRequest) => {
    const { userId } = request.params as { userId?: string };
    const sessionUserId = (request as any).session?.userId;
    const id = userId || sessionUserId;
    return `user:${id}`;
  },

  /**
   * Lock by configuration ID
   */
  configuration: (request: FastifyRequest) => {
    const { configId } = request.params as { configId: string };
    return `config:${configId}`;
  },

  /**
   * Lock by infrastructure ID
   */
  infrastructure: (request: FastifyRequest) => {
    const { infraId } = request.params as { infraId: string };
    return `infrastructure:${infraId}`;
  },

  /**
   * Lock by API key operation
   */
  apiKey: (request: FastifyRequest) => {
    const { keyId } = request.params as { keyId?: string };
    const { tenantId } = request.params as { tenantId?: string };
    const sessionTenantId = (request as any).session?.tenantId;
    const id = keyId || tenantId || sessionTenantId;
    return `apikey:${id}`;
  },

  /**
   * Custom lock resource
   */
  custom: (prefix: string) => (request: FastifyRequest) => {
    const { id } = request.params as { id: string };
    return `${prefix}:${id}`;
  }
};

/**
 * Decorator to add lock management to Fastify request
 */
declare module 'fastify' {
  interface FastifyRequest {
    distributedLock?: {
      resource: string;
      value: string;
      ttl: number;
      acquiredAt: number;
      expiresAt: number;
    };
  }
}

export default createLockMiddleware;

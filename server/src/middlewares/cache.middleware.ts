import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { cacheService } from '../services/cache.service';
import { loggerService } from '../module/logger/logger.service';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string;
  includeQuery?: boolean;
  includeBody?: boolean;
}

/**
 * Cache middleware for GET requests
 * Caches response based on URL and optionally query parameters
 */
export const cacheMiddleware = (options: CacheOptions = {}): preHandlerHookHandler => {
  const {
    ttl = 300, // Default 5 minutes
    keyPrefix = 'api',
    includeQuery = true,
    includeBody = false,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Only cache GET requests
    if (request.method !== 'GET') {
      return;
    }

    // Check if Redis is available
    if (!cacheService.isReady()) {
      return;
    }

    try {
      // Generate cache key
      let cacheKey = `${keyPrefix}:${request.url}`;

      if (includeQuery && Object.keys(request.query as object).length > 0) {
        cacheKey += `:${JSON.stringify(request.query)}`;
      }

      if (includeBody && request.body) {
        cacheKey += `:${JSON.stringify(request.body)}`;
      }

      // Tenant-scope the cache key. Cached reads like GET /api/components and
      // GET /api/credentials/:id return tenant-scoped data but their URL
      // carries no tenant discriminator, so without this the key is global
      // (`api:/api/components`) and Redis serves ONE tenant's list to EVERY
      // tenant — a cross-tenant data leak. The scoping value lives on
      // `request.user.customerId` (set by verifyToken/authMiddleware); falls
      // back to a global key only for genuinely unauthenticated reads (no
      // user), preserving prior behavior there.
      const customerId =
        (request as any).user?.customerId ?? (request as any).customerId;
      if (customerId) {
        cacheKey = `${cacheKey}:customer:${customerId}`;
      }

      // Try to get cached response
      const cachedResponse = await cacheService.get(cacheKey);

      if (cachedResponse) {
        loggerService.debug(`Cache hit for key: ${cacheKey}`);

        // Set cache headers
        reply.header('X-Cache', 'HIT');
        reply.header('X-Cache-Key', cacheKey);

        // Send cached response
        reply.send(cachedResponse);
        return reply;
      }

      loggerService.debug(`Cache miss for key: ${cacheKey}`);

      // Set cache headers
      reply.header('X-Cache', 'MISS');
      reply.header('X-Cache-Key', cacheKey);

      // Hook into response to cache it
      const originalSend = reply.send.bind(reply);
      reply.send = function(payload: any) {
        // Only cache successful responses
        if (reply.statusCode >= 200 && reply.statusCode < 300) {
          // Cache the response asynchronously (don't wait for it)
          cacheService.set(cacheKey, payload, ttl).catch((error) => {
            loggerService.error('Error caching response:', error);
          });
        }

        return originalSend(payload);
      };

    } catch (error) {
      loggerService.error('Error in cache middleware:', error);
      // Continue without caching on error
    }
  };
};

/**
 * Cache invalidation middleware. Register as an **onSend** hook (NOT onResponse):
 * onSend runs before the body reaches the client and its returned promise is
 * awaited by Fastify, so the cache is cleared BEFORE the mutation's response is
 * delivered. onResponse runs *after* the response is sent, which let the
 * client's immediate refetch race the (previously fire-and-forget) delete — an
 * in-flight GET could re-cache the pre-write result AFTER the delete ran,
 * poisoning the key for the full TTL (a real read-after-write staleness bug:
 * create a connection → the new row was invisible until the cache expired).
 * Awaiting the delete before send closes that race.
 */
export const invalidateCacheMiddleware = (patterns: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    // Only invalidate on successful mutations; pass the payload through untouched.
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      reply.statusCode >= 200 &&
      reply.statusCode < 300
    ) {
      try {
        await Promise.all(
          patterns.map((pattern) =>
            cacheService.deletePattern(pattern).catch((error) => {
              loggerService.error(`Error invalidating cache pattern ${pattern}:`, error);
            }),
          ),
        );
      } catch (error) {
        loggerService.error('Error invalidating cache:', error);
      }
    }
    return payload;
  };
};

/**
 * Decorator to add caching to specific routes
 */
export const cached = (ttl: number = 300, keyPrefix?: string) => {
  return cacheMiddleware({ ttl, keyPrefix });
};

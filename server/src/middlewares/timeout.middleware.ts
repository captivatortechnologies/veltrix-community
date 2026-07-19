/**
 * Request timeout middleware for Fastify
 *
 * Implements configurable timeouts for different route types
 * Prevents hanging requests and ensures timely responses
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { loggerService } from '../module/logger/logger.service';

export interface TimeoutConfig {
  default?: number; // Default timeout in milliseconds
  routes?: {
    [pattern: string]: number; // Specific timeouts for routes matching pattern
  };
  onTimeout?: (request: FastifyRequest, reply: FastifyReply) => void;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const LONG_RUNNING_TIMEOUT = 120000; // 2 minutes for deployments, large queries, etc.

/**
 * Default timeout configuration
 */
const defaultConfig: TimeoutConfig = {
  default: DEFAULT_TIMEOUT,
  routes: {
    '/api/pipeline': LONG_RUNNING_TIMEOUT,
    '/api/apps': LONG_RUNNING_TIMEOUT,
    '/api/components/*/deploy': LONG_RUNNING_TIMEOUT,
    '/api/tools/*/test-connection': 10000, // 10 seconds for connection tests
    '/api/health': 5000, // 5 seconds for health checks
  },
};

/**
 * Get timeout duration for a specific route
 */
function getTimeoutForRoute(url: string, config: TimeoutConfig): number {
  // Check for exact match first
  if (config.routes && config.routes[url]) {
    return config.routes[url];
  }

  // Check for pattern match
  if (config.routes) {
    for (const [pattern, timeout] of Object.entries(config.routes)) {
      // Convert glob pattern to regex
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '[^/]+').replace(/\//g, '\\/') + '$'
      );
      if (regex.test(url)) {
        return timeout;
      }
    }
  }

  // Return default timeout
  return config.default || DEFAULT_TIMEOUT;
}

/**
 * Default timeout handler
 */
function defaultTimeoutHandler(request: FastifyRequest, reply: FastifyReply): void {
  const url = request.url;
  const method = request.method;
  const correlationId = (request as any).correlationId;

  loggerService.error('Request timeout', {
    url,
    method,
    correlationId,
    userAgent: request.headers['user-agent'],
  });

  // Send 408 Request Timeout response
  reply.status(408).send({
    error: 'Request timeout',
    message: 'The request took too long to process. Please try again.',
    code: 'REQUEST_TIMEOUT',
    correlationId,
  });
}

/**
 * Create timeout middleware with custom configuration
 */
export function createTimeoutMiddleware(config: TimeoutConfig = {}) {
  const mergedConfig: TimeoutConfig = {
    ...defaultConfig,
    ...config,
    routes: {
      ...defaultConfig.routes,
      ...config.routes,
    },
  };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const timeout = getTimeoutForRoute(request.url, mergedConfig);
    const timeoutHandler = mergedConfig.onTimeout || defaultTimeoutHandler;

    // Create timeout timer
    const timer = setTimeout(() => {
      // Check if response has already been sent
      if (!reply.sent) {
        timeoutHandler(request, reply);
      }
    }, timeout);

    // Clear timeout when response is sent
    reply.raw.on('finish', () => {
      clearTimeout(timer);
    });

    // Clear timeout on error
    reply.raw.on('error', () => {
      clearTimeout(timer);
    });

    // Attach timeout info to request for logging
    (request as any).timeout = timeout;
  };
}

/**
 * Pre-configured timeout middleware with default settings
 */
export const timeoutMiddleware = createTimeoutMiddleware();

/**
 * Timeout middleware for long-running operations
 */
export const longRunningTimeoutMiddleware = createTimeoutMiddleware({
  default: LONG_RUNNING_TIMEOUT,
});

/**
 * Helper to check if request has timed out
 */
export function hasTimedOut(request: FastifyRequest): boolean {
  const startTime = (request as any).startTime || Date.now();
  const timeout = (request as any).timeout || DEFAULT_TIMEOUT;
  const elapsed = Date.now() - startTime;
  return elapsed >= timeout;
}

/**
 * Decorator to add timeout information to request
 */
export function decorateTimeout(fastify: any) {
  fastify.decorateRequest('startTime', null);
  fastify.decorateRequest('timeout', null);

  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
    (request as any).startTime = Date.now();
    done();
  });
}

/**
 * Hook to log slow requests
 */
export function logSlowRequests(threshold = 5000) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as any).startTime || Date.now();
    const duration = Date.now() - startTime;

    if (duration > threshold) {
      loggerService.warn('Slow request detected', {
        url: request.url,
        method: request.method,
        duration,
        threshold,
        correlationId: (request as any).correlationId,
      });
    }
  };
}

/**
 * Middleware to set custom timeout for specific handler
 *
 * @example
 * ```typescript
 * fastify.post('/long-operation', {
 *   preHandler: [withTimeout(120000)], // 2 minutes
 *   handler: longOperationHandler
 * });
 * ```
 */
export function withTimeout(timeoutMs: number) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    (request as any).timeout = timeoutMs;
  };
}

/**
 * Helper to create AbortController with timeout
 * Useful for external API calls
 *
 * @example
 * ```typescript
 * const controller = createAbortController(10000);
 * fetch(url, { signal: controller.signal });
 * ```
 */
export function createAbortController(timeoutMs: number): AbortController {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return controller;
}

/**
 * Configuration for graceful shutdown
 */
export interface ShutdownConfig {
  timeout?: number; // Time to wait for requests to complete
  forceClose?: boolean; // Force close after timeout
}

/**
 * Helper for graceful shutdown
 * Waits for in-flight requests to complete before shutting down
 */
export async function gracefulShutdown(
  fastify: any,
  config: ShutdownConfig = {}
): Promise<void> {
  const {
    timeout = 30000,
    forceClose = true,
  } = config;

  loggerService.info('Starting graceful shutdown...', { timeout });

  // Stop accepting new connections
  fastify.server.unref();

  try {
    // Wait for existing requests to complete
    await Promise.race([
      fastify.close(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
      ),
    ]);

    loggerService.info('Graceful shutdown completed');
  } catch (error) {
    loggerService.error('Graceful shutdown failed', { error });

    if (forceClose) {
      loggerService.warn('Force closing server');
      process.exit(1);
    }
  }
}

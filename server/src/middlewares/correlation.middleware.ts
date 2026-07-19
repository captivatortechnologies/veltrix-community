import { FastifyRequest, FastifyReply } from 'fastify';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  correlationId: string;
  customerId?: string;
  userId?: string;
  requestStartTime: number;
  requestPath: string;
  requestMethod: string;
}

/**
 * AsyncLocalStorage for request context
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Get correlation ID from current request
 */
export function getCorrelationId(): string | undefined {
  const context = getRequestContext();
  return context?.correlationId;
}

/**
 * Fastify middleware to add correlation ID and request context
 */
export async function correlationMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get or generate correlation ID
  const correlationId =
    (request.headers['x-correlation-id'] as string) ||
    (request.headers['x-request-id'] as string) ||
    randomUUID();

  // Extract customer and user IDs from request
  const customerId = (request as any).customerId || (request.headers['x-customer-id'] as string);
  const userId = request.user?.id;

  // Create request context
  const context: RequestContext = {
    correlationId,
    customerId,
    userId,
    requestStartTime: Date.now(),
    requestPath: request.url,
    requestMethod: request.method,
  };

  // Add correlation ID to response headers
  reply.header('X-Correlation-ID', correlationId);

  // Run the rest of the request in the context
  requestContext.run(context, () => {
    // Log request start
    request.log.info({
      msg: 'Request started',
      correlationId,
      customerId,
      userId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
    });
  });
}

/**
 * Fastify hook to log request completion
 */
export async function correlationLoggerHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
): Promise<any> {
  const context = getRequestContext();
  if (context) {
    const duration = Date.now() - context.requestStartTime;
    request.log.info({
      msg: 'Request completed',
      correlationId: context.correlationId,
      customerId: context.customerId,
      userId: context.userId,
      method: context.requestMethod,
      url: context.requestPath,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
    });
  }
  return payload;
}

/**
 * Decorator to add correlation context to service methods
 */
export function withContext<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: any[]) => {
    const context = getRequestContext();
    if (context) {
      return fn(...args, context);
    }
    return fn(...args);
  }) as T;
}

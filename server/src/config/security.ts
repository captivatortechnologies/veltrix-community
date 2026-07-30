import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Register security plugins
 */
export async function registerSecurityPlugins(server: FastifyInstance) {
  // Helmet for security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // NOTE: @fastify/compress was removed here. Once these security plugins are
  // applied globally to /api (via fastify-plugin), it emits a
  // `content-encoding: br` header with an EMPTY body on responses >1KB — every
  // large /api success (e.g. login's token+user+permissions) comes back 200 with
  // a 0-byte body, which the client surfaces as "Network error". Compression is
  // not a security control and a reverse proxy (nginx) already gzips at the edge,
  // so it is dropped. If reintroduced, do it in its own plugin, gzip-only, and
  // load-test large JSON responses.

  // Global rate limiting. Backed by the same Redis instance used for BullMQ,
  // so limits are shared/consistent across horizontally-scaled replicas
  // instead of each process keeping its own in-memory counter.
  const rateLimitRedis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  rateLimitRedis.on('error', (err) => {
    server.log.warn({ err }, '[rate-limit] Redis connection error — falling back to in-memory limiting');
  });

  await server.register(rateLimit, {
    max: 100, // Maximum requests per window
    timeWindow: '1 minute', // Time window
    cache: 10000, // In-memory LRU size (used when Redis is unavailable)
    // Loopback whitelist for local development and on-box health checks. `::1`
    // and the IPv4-mapped form are required, not optional: on a dual-stack
    // machine `localhost` resolves to IPv6 first, so a dev/E2E client arrives as
    // `::1` and the 127.0.0.1 entry alone never matched — local runs were being
    // throttled (429) partway through, reading as an unrelated request timeout.
    // Production is unaffected: trustProxy is enabled, so request.ip is the real
    // client address from X-Forwarded-For and these never match a genuine user.
    allowList: ['127.0.0.1', '::1', '::ffff:127.0.0.1'], // loopback for local/dev
    redis: rateLimitRedis,
    keyGenerator: (request) => {
      // Use customer ID or IP address for rate limiting
      return (request as any).customerId || request.ip;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        statusCode: 429,
        retryAfter: context.ttl,
      };
    },
  });
}

/**
 * Custom rate limit decorator for specific routes
 */
export const rateLimitOptions = {
  strict: {
    max: 10,
    timeWindow: '1 minute',
  },
  moderate: {
    max: 50,
    timeWindow: '1 minute',
  },
  relaxed: {
    max: 200,
    timeWindow: '1 minute',
  },
};

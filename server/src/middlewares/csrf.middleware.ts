/**
 * CSRF (Cross-Site Request Forgery) Protection Middleware
 *
 * Implements double-submit cookie pattern for CSRF protection
 * Validates CSRF tokens on state-changing operations (POST, PUT, PATCH, DELETE)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { loggerService } from '../module/logger/logger.service';

// CSRF token configuration
const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const CSRF_COOKIE_OPTIONS = {
  httpOnly: false, // Must be false so JavaScript can read it
  secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
  sameSite: 'lax' as const, // Allow cross-origin requests from localhost during development
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Middleware to generate and set CSRF token cookie
 * Should be applied to routes that render forms or pages
 */
export async function setCsrfToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Check if token already exists in cookie
  let token = request.cookies?.[CSRF_COOKIE_NAME];

  // If no token exists, generate a new one
  if (!token) {
    token = generateCsrfToken();
    reply.setCookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
    loggerService.debug('Generated new CSRF token for request');
  }

  // Attach token to request for use in responses
  (request as any).csrfToken = token;
}

/**
 * Middleware to verify CSRF token on state-changing requests
 * Checks that the token in the header matches the token in the cookie
 */
export async function verifyCsrfToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const method = request.method.toUpperCase();

  // Only verify on state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return;
  }

  // Skip CSRF check for API key authentication
  // API keys are inherently protected against CSRF as they're not automatically sent by browsers
  if (request.headers['x-api-key']) {
    loggerService.debug('Skipping CSRF check for API key request');
    return;
  }

  // Get token from cookie
  const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];

  // Get token from header or body
  const headerToken = request.headers[CSRF_HEADER_NAME.toLowerCase()] as string;
  const bodyToken = (request.body as any)?.csrfToken;
  const requestToken = headerToken || bodyToken;

  // Verify both tokens exist
  if (!cookieToken) {
    loggerService.warn('CSRF token missing from cookie', {
      method,
      url: request.url,
    });
    return reply.status(403).send({
      error: 'CSRF token missing from cookie',
      code: 'CSRF_COOKIE_MISSING',
    });
  }

  if (!requestToken) {
    loggerService.warn('CSRF token missing from request', {
      method,
      url: request.url,
    });
    return reply.status(403).send({
      error: 'CSRF token missing from request. Include token in X-XSRF-TOKEN header or request body',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  // Verify tokens match using timing-safe comparison
  const cookieBuffer = Buffer.from(cookieToken);
  const requestBuffer = Buffer.from(requestToken);
  const tokensMatch =
    cookieBuffer.length === requestBuffer.length &&
    crypto.timingSafeEqual(cookieBuffer, requestBuffer);

  if (!tokensMatch) {
    loggerService.warn('CSRF token mismatch', {
      method,
      url: request.url,
    });
    return reply.status(403).send({
      error: 'CSRF token validation failed',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  loggerService.debug('CSRF token verified successfully');
}

/**
 * Decorator to add CSRF token to Fastify request
 * Adds a csrfToken() method that can be called to get the current token
 */
export function decorateCsrfToken(fastify: any) {
  fastify.decorateRequest('csrfToken', function (this: FastifyRequest) {
    return this.cookies?.[CSRF_COOKIE_NAME] || generateCsrfToken();
  });
}

/**
 * Configuration for CSRF protection
 * Can be customized based on environment
 */
export interface CsrfConfig {
  enabled?: boolean;
  cookieName?: string;
  headerName?: string;
  tokenLength?: number;
  excludePaths?: string[];
}

/**
 * Factory function to create CSRF middleware with custom config
 */
export function createCsrfProtection(config: CsrfConfig = {}) {
  const {
    enabled = process.env.NODE_ENV !== 'test',
    excludePaths = [
      '/api/auth/login',
      '/api/auth/signup',
      '/api/auth/check-user',
      '/api/webhooks',
      '/api/google',
      '/api/microsoft',
      '/api/cognito'
    ],
  } = config;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if disabled
    if (!enabled) {
      return;
    }

    // Skip for excluded paths
    if (excludePaths.some(path => request.url.startsWith(path))) {
      return;
    }

    // Set token for all requests
    await setCsrfToken(request, reply);

    // Verify token for state-changing requests
    await verifyCsrfToken(request, reply);
  };
}

/**
 * Middleware to rotate CSRF token after successful authentication
 * Should be called after login/signup to prevent session fixation
 */
export async function rotateCsrfToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const newToken = generateCsrfToken();
  reply.setCookie(CSRF_COOKIE_NAME, newToken, CSRF_COOKIE_OPTIONS);
  (request as any).csrfToken = newToken;
  loggerService.debug('Rotated CSRF token after authentication');
}

/**
 * Helper to include CSRF token in response body
 * Useful for API responses that need to send the token to the client
 */
export function includeCsrfToken(request: FastifyRequest, responseBody: any): any {
  const token = (request as any).csrfToken || request.cookies?.[CSRF_COOKIE_NAME];
  return {
    ...responseBody,
    csrfToken: token,
  };
}

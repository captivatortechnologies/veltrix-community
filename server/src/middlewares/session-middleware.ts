/**
 * Session Middleware
 *
 * Fastify middleware for session management.
 * Validates session from cookie or Authorization header.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from '../lib/session-manager';

declare module 'fastify' {
  interface FastifyRequest {
    session?: {
      id: string;
      userId: string;
      tenantId: string;
      email: string;
      role: string;
      permissions: string[];
      metadata?: Record<string, unknown>;
    };
  }
}

export interface SessionMiddlewareOptions {
  /** Session manager instance */
  sessionManager: SessionManager;
  /** Cookie name for session ID (default: 'sessionId') */
  cookieName?: string;
  /** Require authentication (default: true) */
  required?: boolean;
  /** Required permissions */
  requiredPermissions?: string[];
  /** Required role */
  requiredRole?: string;
}

/**
 * Create session middleware
 */
export function createSessionMiddleware(options: SessionMiddlewareOptions) {
  const {
    sessionManager,
    cookieName = 'sessionId',
    required = true,
    requiredPermissions = [],
    requiredRole
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Get session ID from cookie or Authorization header
      let sessionId = request.cookies[cookieName];

      if (!sessionId) {
        // Try Authorization header (format: "Session <sessionId>")
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Session ')) {
          sessionId = authHeader.substring(8);
        }
      }

      // No session ID found
      if (!sessionId) {
        if (required) {
          reply.code(401).send({
            error: 'Unauthorized',
            message: 'No session found'
          });
          return;
        }
        return;
      }

      // Validate session
      const sessionData = await sessionManager.validateSession(sessionId);

      if (!sessionData) {
        if (required) {
          reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired session'
          });
          return;
        }
        return;
      }

      // Check required role
      if (requiredRole && sessionData.role !== requiredRole) {
        reply.code(403).send({
          error: 'Forbidden',
          message: `Required role: ${requiredRole}`
        });
        return;
      }

      // Check required permissions
      if (requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every(permission =>
          sessionData.permissions.includes(permission)
        );

        if (!hasPermissions) {
          reply.code(403).send({
            error: 'Forbidden',
            message: `Missing required permissions: ${requiredPermissions.join(', ')}`
          });
          return;
        }
      }

      // Attach session to request
      request.session = {
        id: sessionId,
        userId: sessionData.userId,
        tenantId: sessionData.tenantId,
        email: sessionData.email,
        role: sessionData.role,
        permissions: sessionData.permissions,
        metadata: sessionData.metadata
      };

    } catch (error) {
      console.error('Session middleware error:', error);

      if (required) {
        reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Failed to validate session'
        });
      }
    }
  };
}

/**
 * Optional session middleware (doesn't require authentication)
 */
export function optionalSessionMiddleware(sessionManager: SessionManager, cookieName = 'sessionId') {
  return createSessionMiddleware({
    sessionManager,
    cookieName,
    required: false
  });
}

/**
 * Require specific permissions middleware
 */
export function requirePermissions(
  sessionManager: SessionManager,
  permissions: string[],
  cookieName = 'sessionId'
) {
  return createSessionMiddleware({
    sessionManager,
    cookieName,
    required: true,
    requiredPermissions: permissions
  });
}

/**
 * Require specific role middleware
 */
export function requireRole(
  sessionManager: SessionManager,
  role: string,
  cookieName = 'sessionId'
) {
  return createSessionMiddleware({
    sessionManager,
    cookieName,
    required: true,
    requiredRole: role
  });
}

export default createSessionMiddleware;

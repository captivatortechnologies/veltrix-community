// ========================================================================
// Canonical auth middleware — single source of truth for request auth.
//
// Token verification goes through authService.verifyAccessToken (one
// verification path, one secret). verifyToken sets BOTH the typed
// `request.user` (with the role name loaded) AND the legacy
// x-user-id / x-customer-id / x-role-id headers (many handlers still read
// the headers).
//
// Admin semantics: a user is admin when their role is the platform
// operator role (via platform-authz) OR their role holds the `all:all`
// permission — the codebase's tenant-admin convention (seeds create
// 'Administrator' with all:all).
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db';
import { authService } from '../module/auth/auth.service';
import { loggerService } from '../module/logger/logger.service';
import { isPlatformAdminRoleName } from '../lib/platform-authz';
import {
  getRolePermissions,
  hasAllAllPermission,
  checkPermission,
  type PermissionCheckOptions,
} from '../lib/permissions';

/** Authenticated principal attached to every request by verifyToken. */
export interface AuthenticatedUser {
  id: string;
  customerId: string;
  roleId: string;
  /** Role name, loaded during verifyToken (undefined if the role row is gone). */
  role?: string;
  /**
   * The tenant's human-readable shortname (Organization.shortName). Populated
   * for app requests by ensureAppEnabled so apps can tag provisioned
   * resources with a legible tenant label instead of the org UUID. Undefined
   * elsewhere.
   */
  customerShortName?: string | null;
}

// Single authoritative FastifyRequest augmentation for `request.user`.
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// Permission resolution (getRolePermissions, hasAllAllPermission,
// checkPermission) lives in ../lib/permissions — the single source of
// truth shared with GET /api/me/permissions, the login response, the role
// CRUD escalation guard, app-route-registrar's hasAppPermission, and the
// PipelineContext permission snapshot. Re-exported here for callers that
// import them from this module.
export { getRolePermissions, hasAllAllPermission };

// Middleware to verify JWT token
export const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Verify via the auth service — the same code path that issued the token.
    const decoded = authService.verifyAccessToken(token);

    if (!decoded) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // Legacy headers — many downstream handlers still read these.
    request.headers['x-user-id'] = String(decoded.userId);
    request.headers['x-customer-id'] = decoded.customerId;
    request.headers['x-role-id'] = String(decoded.roleId);

    // Typed user object with the role name loaded.
    request.user = {
      id: decoded.userId,
      customerId: decoded.customerId,
      roleId: decoded.roleId,
    };

    const userRole = await prisma.role.findUnique({
      where: { id: decoded.roleId },
    });

    if (userRole) {
      request.user.role = userRole.name;
    }

    // Continue to next handler
  } catch (error) {
    loggerService.error('Error in auth middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

/**
 * Soft/non-throwing variant of verifyToken's decode step: resolves the
 * VERIFIED customerId from a Bearer token if one is present and valid, else
 * `undefined`. Never rejects the request.
 *
 * Used by routes that must stay reachable by an anonymous caller (e.g. the
 * IdP config GETs, which pre-login pages poll to decide whether to render an
 * SSO button) but still need a TRUSTWORTHY tenant scope when a caller does
 * happen to be logged in — reading `x-customer-id` directly off the request
 * would trust a header the client fully controls, reopening the exact
 * tenant-spoofing gap closed elsewhere by verifyToken overwriting it from
 * the verified JWT.
 */
export const tryResolveVerifiedCustomerId = async (request: FastifyRequest): Promise<string | undefined> => {
  try {
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) return undefined;

    const decoded = authService.verifyAccessToken(token);
    return decoded?.customerId;
  } catch (error) {
    loggerService.error('Error resolving verified customerId:', error);
    return undefined;
  }
};

// Middleware to check if user has permission for a resource and action.
// appId-aware — pass `{ appId }` to gate an app-scoped resource (a config
// type or an app-declared resource); omit it for a platform resource. The
// check itself (wildcard semantics, the "platform row satisfies an
// app-scoped check too" rule) lives in ../lib/permissions so
// app-route-registrar's hasAppPermission — and every other caller —
// resolves permissions identically.
export const hasPermission = (resource: string, action: string, opts: PermissionCheckOptions = {}) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const roleId = request.user?.roleId || (request.headers['x-role-id'] as string);

      loggerService.debug(`Checking permission for roleId: ${roleId}, resource: ${resource}, action: ${action}`, {
        appId: opts.appId,
      });

      if (!roleId) {
        loggerService.warn('No roleId found on request');
        return reply.status(401).send({ error: 'Authentication required' });
      }

      // Get role
      const role = await prisma.role.findUnique({
        where: { id: roleId }
      });

      if (!role) {
        loggerService.warn(`Role with ID ${roleId} not found`);
        return reply.status(403).send({ error: 'Role not found' });
      }

      // Platform operators have every permission (they don't carry tenant
      // permission rows).
      if (isPlatformAdminRoleName(role.name)) {
        loggerService.debug('User has platform-admin role, granting access');
        return;
      }

      const permissions = await getRolePermissions(roleId);

      loggerService.debug(`Found role: ${role.name} with ${permissions.length} permissions`, {
        roleName: role.name,
        permissions: permissions.map(p => ({ resource: p.resource, action: p.action, appId: p.appId }))
      });

      if (!checkPermission(permissions, resource, action, opts)) {
        loggerService.warn(`User does not have permission to ${action} ${resource}`, {
          roleId,
          roleName: role.name,
          resource,
          action,
          appId: opts.appId,
        });
        return reply.status(403).send({
          error: `Access denied: You don't have permission to ${action} ${resource}`
        });
      }

      loggerService.debug(`User has permission to ${action} ${resource}, granting access`);
      // User has permission, continue to next handler
    } catch (error) {
      loggerService.error('Error in permission middleware:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  };
};

// Middleware to ensure customer ID in URL matches authenticated customer
export const ensureCustomerMatch = async (request: FastifyRequest<{ Params: { customerId: string } }>, reply: FastifyReply) => {
  try {
    const authenticatedCustomerId =
      request.user?.customerId || (request.headers['x-customer-id'] as string);
    const urlCustomerId = request.params.customerId;

    if (!authenticatedCustomerId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Check if customer ID in URL matches authenticated customer
    if (authenticatedCustomerId !== urlCustomerId) {
      // Check if user has admin role (can access other customers)
      const roleId = request.user?.roleId || (request.headers['x-role-id'] as string);

      // Get role
      const role = await prisma.role.findUnique({
        where: { id: roleId }
      });

      // Check if role is the platform-admin role
      const isSystemAdmin = isPlatformAdminRoleName(role?.name);

      // Check if role has admin permissions
      const isAdmin =
        isSystemAdmin || hasAllAllPermission(await getRolePermissions(roleId));

      if (!isAdmin) {
        return reply.status(403).send({
          error: 'Access denied: You can only access resources for your own customer'
        });
      }
    }

    // Customer ID matches or user is admin, continue to next handler
  } catch (error) {
    loggerService.error('Error in customer match middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

// Middleware to ensure user is a tenant admin (all:all) or platform operator
export const ensureAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const roleId = request.user?.roleId || (request.headers['x-role-id'] as string);

    if (!roleId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    // Get role
    const role = await prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!role) {
      return reply.status(403).send({ error: 'Role not found' });
    }

    // Platform operator role has access to everything
    if (isPlatformAdminRoleName(role.name)) {
      return;
    }

    // Tenant admin: role holds the all:all permission
    if (!hasAllAllPermission(await getRolePermissions(roleId))) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    // User is admin, continue to next handler
  } catch (error) {
    loggerService.error('Error in admin middleware:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};

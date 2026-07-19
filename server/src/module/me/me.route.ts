// ========================================================================
// "Me" routes — endpoints scoped to the authenticated user themselves.
//
// GET /api/me/permissions — R1 (RBAC/IdP hardening, 2026-07-10). The
// client's single source of truth for what the current user can do: fetched
// once at login (see the `permissions` block on the login response) and
// on demand (e.g. after a role edit, or before rendering a gated action).
// ========================================================================

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '../../middlewares/authMiddleware';
import { resolvePermissionSnapshotForUser } from '../../lib/permissions';
import { loggerService } from '../logger/logger.service';

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const permissionSnapshotSchema = {
  type: 'object',
  required: ['permissions', 'wildcards'],
  properties: {
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          resource: { type: 'string' },
          action: { type: 'string' },
          appId: { type: ['string', 'null'] }
        }
      }
    },
    wildcards: {
      type: 'object',
      properties: {
        allAll: { type: 'boolean' },
        resources: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

export async function meRoutes(fastify: FastifyInstance) {
  fastify.get('/me/permissions', {
    preHandler: [verifyToken],
    schema: {
      tags: ['me'],
      summary: "Get the current user's resolved permission snapshot",
      description:
        'Returns the effective permissions (resource/action/appId) and wildcard flags for the ' +
        'authenticated user. Fetched at login and on demand — the client mirrors this ' +
        "server's matching semantics rather than trusting a cached role name.",
      security: [{ bearerAuth: [] }],
      response: {
        200: permissionSnapshotSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.id;
        if (!userId) {
          return reply.status(401).send({ error: 'Authentication required' });
        }

        const snapshot = await resolvePermissionSnapshotForUser(userId);
        reply.send(snapshot);
      } catch (error) {
        loggerService.error('Error resolving permission snapshot:', error);
        reply.status(500).send({ error: 'Failed to resolve permissions' });
      }
    }
  });
}

export default meRoutes;

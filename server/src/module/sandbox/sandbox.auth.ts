// ========================================================================
// Sandbox Auth
//
// Sandbox routes accept EITHER:
//   - a JWT session (portal user)  -> requires RBAC permission sandbox:manage
//   - an API key (Veltrix CLI)     -> requires scope sandbox:read / sandbox:write
//
// This composes the existing verifyToken / verifyApiKey middlewares rather
// than re-implementing authentication; only the authorization layer
// (scopes / RBAC) is sandbox-specific. `sandbox:write` implies read access.
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../../db'
import { verifyToken } from '../../middlewares/authMiddleware'
import { verifyApiKey } from '../../middlewares/apiKeyMiddleware'
import { loggerService } from '../logger/logger.service'

export type SandboxScope = 'sandbox:read' | 'sandbox:write'

/** RBAC permission (resource:action) a JWT user needs on sandbox routes. */
export const SANDBOX_RBAC_RESOURCE = 'sandbox'
export const SANDBOX_RBAC_ACTION = 'manage'

interface PermissionRow {
  resource: string
  action: string
}

interface AuthenticatedUser {
  id: string
  customerId: string
  roleId: string
  apiKey?: boolean
  apiKeyScopes?: string[]
}

function isApiKeyRequest(request: FastifyRequest): boolean {
  const authHeader = request.headers.authorization
  return Boolean(request.headers['x-api-key'] || (authHeader && authHeader.startsWith('ApiKey ')))
}

/**
 * True when the authenticated actor is a real portal user (JWT), as opposed
 * to an API key principal. Used to decide whether audit rows can reference
 * the user and whether createdById can be persisted.
 */
export function getActorUserId(request: FastifyRequest): string | null {
  const user = (request as { user?: AuthenticatedUser }).user
  if (!user || user.apiKey) return null
  return user.id
}

/**
 * Which peer authored a mutation: API-key callers are the Veltrix CLI ('cli'),
 * JWT callers are the browser portal ('portal'). Used to stamp
 * `sandbox:file-changed` events so peers can echo-guard their own writes.
 */
export function getRequestOrigin(request: FastifyRequest): 'portal' | 'cli' {
  const user = (request as { user?: AuthenticatedUser }).user
  return user?.apiKey ? 'cli' : 'portal'
}

async function roleHasSandboxPermission(roleId: string): Promise<boolean> {
  const permissions = await prisma.$queryRaw<PermissionRow[]>`
    SELECT resource, action FROM "Permission" WHERE "roleId" = ${roleId}
  `

  return permissions.some(
    (p) =>
      (p.resource === 'all' && p.action === 'all') ||
      (p.resource === SANDBOX_RBAC_RESOURCE &&
        (p.action === SANDBOX_RBAC_ACTION || p.action === 'all')),
  )
}

/**
 * Build a preHandler enforcing sandbox auth for the given scope.
 */
export function requireSandboxAuth(scope: SandboxScope) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (isApiKeyRequest(request)) {
        await verifyApiKey(request as Parameters<typeof verifyApiKey>[0], reply)
        if (reply.sent) return

        const user = (request as { user?: AuthenticatedUser }).user
        const scopes = user?.apiKeyScopes ?? []
        const satisfied =
          scopes.includes(scope) ||
          // write access implies read access
          (scope === 'sandbox:read' && scopes.includes('sandbox:write'))

        if (!satisfied) {
          loggerService.warn('Sandbox auth: API key missing required scope', {
            requiredScope: scope,
            presentScopes: scopes,
          })
          reply.status(403).send({ error: `API key is missing the required scope "${scope}"` })
        }
        return
      }

      // JWT path
      await verifyToken(request, reply)
      if (reply.sent) return

      const roleId = request.headers['x-role-id'] as string | undefined
      if (!roleId) {
        reply.status(401).send({ error: 'Authentication required' })
        return
      }

      const allowed = await roleHasSandboxPermission(roleId)
      if (!allowed) {
        loggerService.warn('Sandbox auth: user lacks sandbox:manage permission', { roleId })
        reply.status(403).send({
          error: "Access denied: you need the 'sandbox:manage' permission to use sandboxes",
        })
      }
    } catch (error) {
      loggerService.error('Sandbox auth middleware error:', error)
      reply.status(500).send({ error: 'Internal server error' })
    }
  }
}

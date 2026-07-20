// ========================================================================
// App Route Registrar
//
// Dynamically registers app server routes with Fastify.
// Each app's routes are prefixed with /api/apps/{appId}/
// and protected by the standard auth + app-specific permission middleware.
// ========================================================================

import { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify'
import * as path from 'path'
import prisma from '../../db'
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware'
import { loggerService } from '../../module/logger/logger.service'
import { createAppEventPublisher } from '../app-events/app-event-publisher'
import { decryptCredentialSecrets } from '../../module/credential/credential.service'
import type { AppManifest } from '../../../../shared/types/app'

/**
 * A permission requirement a route can declare via its Fastify `config`
 * bag: `{ config: { requiresAppPermission: { resource, action } } }` (or an
 * array, for an AND of several requirements).
 */
export interface AppRoutePermissionRequirement {
  resource: string
  action: string
}

/**
 * Middleware that checks if the requesting user's customer has the app enabled.
 */
const ensureAppEnabled = (appId: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user?.customerId
      if (!customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const installation = await prisma.appInstallation.findFirst({
        where: {
          app: { appId },
          customerId,
          enabled: true,
          status: 'ENABLED',
        },
      })

      if (!installation) {
        return reply.status(403).send({
          error: `App "${appId}" is not enabled for your organization`,
        })
      }

      // Inject the tenant's human-readable shortname so apps can tag provisioned
      // cloud resources with a legible label (Organization.shortName) rather than
      // the customer UUID — apps must not query platform tables themselves. One
      // indexed PK lookup, scoped to app requests only. Best-effort: a failure to
      // resolve it never blocks the request (tagging falls back to the UUID).
      try {
        if (request.user && request.user.customerShortName === undefined) {
          const organization = await prisma.organization.findUnique({
            where: { id: customerId },
            select: { shortName: true },
          })
          request.user.customerShortName = organization?.shortName ?? null
        }
      } catch (e) {
        loggerService.warn(`Could not resolve shortName for customer ${customerId}:`, e)
      }
    } catch (error) {
      loggerService.error(`Error checking app "${appId}" enabled status:`, error)
      return reply.status(500).send({ error: 'Internal server error' })
    }
  }
}

/**
 * Same check as `ensureAppEnabled`, but for routes registered under the
 * SHARED `/api/apps` prefix (app-management.route.ts, app-config-template
 * route.ts) where `:appId` is a per-request URL param rather than fixed at
 * registration time. Exported so those route modules can reuse the exact
 * same enabled-check the per-app registered routes use.
 */
export const ensureAppEnabledForParam = async (
  request: FastifyRequest<{ Params: { appId: string } }>,
  reply: FastifyReply,
) => {
  return ensureAppEnabled(request.params.appId)(request, reply)
}

/**
 * Middleware that checks app-scoped permissions.
 *
 * R2 (RBAC/IdP hardening, 2026-07-10): unified onto the same appId-aware
 * hasPermission every other route in the platform uses — this used to be a
 * separate raw-SQL implementation with its own (slightly different) wildcard
 * logic. Now a thin wrapper: `hasAppPermission(appId, resource, action)` is
 * exactly `hasPermission(resource, action, { appId })`.
 *
 * `appId` here MUST be `App.id` (the UUID `Permission.appId` is a foreign key
 * to) — never the manifest/URL slug (`App.appId`, e.g. "crowdstrike-edr").
 * Callers in this file resolve that id once via Prisma before reaching here
 * (see `registerAppRoutes`); `null` means "no app-scoped identity resolved",
 * which still lets a platform-scoped wildcard satisfy the check (decision 2)
 * but can never match an app-scoped grant.
 */
export const hasAppPermission = (appId: string | null, resource: string, action: string) =>
  hasPermission(resource, action, { appId })

/**
 * R3 (RBAC/IdP hardening, 2026-07-10): auto-gate dynamically-registered app
 * routes from a declarative requirement, rather than relying on the app
 * author remembering to call `ctx.hasPermission(...)` inline in every route's
 * `preHandler`. A route that sets:
 *
 *   fastify.get('/indexes', {
 *     config: { requiresAppPermission: { resource: 'indexes', action: 'read' } },
 *     handler: ...
 *   })
 *
 * gets `hasAppPermission(appId, resource, action)` enforced by the registrar
 * itself — enforcement no longer depends on the app's own code. Multiple
 * requirements (array) are AND-ed. `ctx.hasPermission` (opt-in, inline) keeps
 * working unchanged for apps that prefer it or need custom logic; both can be
 * used on the same route.
 */
function installAppPermissionAutoGate(appInstance: FastifyInstance, appId: string | null): void {
  appInstance.addHook('onRoute', (routeOptions: RouteOptions) => {
    const config = routeOptions.config as
      | { requiresAppPermission?: AppRoutePermissionRequirement | AppRoutePermissionRequirement[] }
      | undefined
    const declared = config?.requiresAppPermission
    if (!declared) return

    const requirements = Array.isArray(declared) ? declared : [declared]
    const guards = requirements.map((r) => hasAppPermission(appId, r.resource, r.action))

    const existing = routeOptions.preHandler
    const existingArray = existing ? (Array.isArray(existing) ? existing : [existing]) : []
    routeOptions.preHandler = [...existingArray, ...guards] as typeof routeOptions.preHandler

    loggerService.debug(
      `[AppRouteRegistrar] Auto-gated ${routeOptions.method} ${routeOptions.url} for app "${appId}"`,
      { requirements },
    )
  })
}

/**
 * Register an app's routes with Fastify.
 * The app's server module is expected to export a function that accepts a Fastify instance.
 */
export async function registerAppRoutes(
  fastify: FastifyInstance,
  manifest: AppManifest,
  appDir: string,
  serverModule: any,
): Promise<void> {
  const prefix = manifest.server.routes?.prefix || `/api/apps/${manifest.id}`

  try {
    // Permission.appId is a foreign key to App.id (a UUID) — role grants made
    // through the sanctioned role API (role.route.ts, resource-catalog.ts,
    // RoleManagement.tsx) are always keyed by that id, never the manifest slug
    // used everywhere ELSE in this file (route prefix, ensureAppEnabled, ...).
    // Resolve it once per app registration (boot time, not per-request) so
    // hasAppPermission checks below compare against the identity a grant
    // actually uses. `null` when the App row isn't registered yet — fail-
    // closed (an app-scoped grant simply can't match; a platform wildcard
    // still can, per decision 2), never worse than the pre-fix behavior.
    const appRecord = await prisma.app.findUnique({ where: { appId: manifest.id }, select: { id: true } })
    const permissionAppId = appRecord?.id ?? null

    // If the server module exports a Fastify plugin function, register it
    const registerFn = serverModule?.default || serverModule?.registerRoutes || serverModule

    if (typeof registerFn === 'function') {
      await fastify.register(
        async (appInstance: FastifyInstance) => {
          // Add app-level preHandler hooks for auth + app enabled check
          appInstance.addHook('preHandler', verifyToken)
          appInstance.addHook('preHandler', ensureAppEnabled(manifest.id))

          // Declarative permission auto-gate (must be installed BEFORE the
          // app registers its routes — onRoute only fires for routes added
          // after the hook exists).
          installAppPermissionAutoGate(appInstance, permissionAppId)

          // Let the app register its routes
          await registerFn(appInstance, {
            appId: manifest.id,
            appDir,
            manifest,
            db: prisma,
            events: createAppEventPublisher(manifest.id),
            hasPermission: (resource: string, action: string) =>
              hasAppPermission(permissionAppId, resource, action),
            // First-class credential seam (replaces apps re-implementing the
            // platform's AES-GCM decrypt + raw Credential reads). Resolves a
            // tenant Connection (a Credential row) by id to its DECRYPTED secret
            // + endpoint, scoped to the tenant. The secret stays server-side;
            // apps must never return it to the client.
            resolveConnection: async (customerId: string, credentialId: string) => {
              if (!customerId || !credentialId) return null
              const raw = await prisma.credential.findFirst({
                where: { id: credentialId, customerId },
              })
              if (!raw) return null
              const dec = decryptCredentialSecrets(raw)
              return {
                id: dec.id,
                name: dec.name,
                endpoint: raw.endpoint ?? null,
                username: dec.username ?? '',
                password: dec.password ?? '',
                apiToken: dec.apiToken ?? null,
                certificate: (dec as { certificate?: string | null }).certificate ?? null,
              }
            },
          })
        },
        { prefix },
      )

      loggerService.info(`[AppRouteRegistrar] Registered routes for "${manifest.id}" at ${prefix}`)
    }
  } catch (err) {
    loggerService.error(`[AppRouteRegistrar] Failed to register routes for "${manifest.id}":`, err)
  }
}

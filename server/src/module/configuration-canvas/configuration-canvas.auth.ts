// ========================================================================
// Configuration Canvas — App-Scoped Permission Guards
//
// URGENT security fix (2026-07-11): every canvas route was gated only by
// the flat platform `configuration-canvas:read`/`:write` permission — a
// role holding that ONE grant could act on every tenant's canvas across
// every tool, with no way to scope a role down to just one tool's canvases.
//
// ConfigurationCanvas is a legacy, standalone subsystem (Splunk/CrowdStrike
// tool configs) that predates the App platform: there is no FK from
// ConfigurationCanvas to App/AppConfigType in schema.prisma, and
// `toolType` values ('SPLUNK_ENTERPRISE', 'CROWDSTRIKE', ...) don't match
// the App slug or configTypeId shape. So unlike app-config-template.route.ts
// (which resolves a real App.id from a manifest slug already known to be an
// installed app), there is usually no real App to resolve `toolType` to
// today — `resolveAppIdForToolType` is a best-effort, case-insensitive
// lookup against installed App slugs that simply returns `null` when
// nothing matches (the common case in this repo, which ships no app
// manifests). That's not a no-op: passing appId through `hasAppPermission`
// (rather than skipping the check entirely) means:
//   - EVERY existing role's platform-scoped `configuration-canvas` grant
//     keeps working unchanged (checkPermission's wildcard rule: a
//     platform-scoped row satisfies an app-scoped check for the SAME
//     resource name, regardless of appId) — zero regression today.
//   - the day a real app matching a canvas's toolType IS installed, an
//     admin can grant `configuration-canvas` scoped to just that app's
//     `Permission.appId`, and a role holding ONLY that scoped grant is
//     correctly denied on every other tool's canvases — the actual
//     tightening this fix exists for.
// ========================================================================

import { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '../../db'
import { hasAppPermission } from '../../core/app-engine/app-route-registrar'

export type CanvasPermissionAction = 'read' | 'write'

/**
 * Best-effort: resolve `toolType` to the installed App's real `App.id` (a
 * UUID, the identity `Permission.appId` is a foreign key to) via a
 * case-insensitive match against `App.appId` (the manifest slug). Returns
 * `null` when no installed app matches — the common case for this legacy
 * canvas subsystem — which still lets a platform-scoped wildcard grant
 * satisfy the permission check (see module doc above).
 */
export async function resolveAppIdForToolType(toolType: string): Promise<string | null> {
  if (!toolType) return null

  const app = await prisma.app.findFirst({
    where: { appId: { equals: toolType, mode: 'insensitive' } },
    select: { id: true },
  })

  return app?.id ?? null
}

/**
 * Guard for every `:id`-scoped canvas route (GET/PUT/DELETE, status,
 * duplicate, export, history, versions, approvals, comments, ...): loads
 * the canvas (tenant-scoped — never leaks cross-tenant existence),
 * resolves its app scope from `toolType`, and delegates to
 * `hasAppPermission`. 404s before the permission check if the canvas isn't
 * in the caller's own tenant, matching what the controller would do anyway.
 */
export function ensureCanvasPermission(action: CanvasPermissionAction) {
  return async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<FastifyReply | void> => {
    const customerId = request.user?.customerId
    if (!customerId) {
      return reply.status(401).send({ error: 'Authentication required' })
    }

    const canvas = await prisma.configurationCanvas.findFirst({
      where: { id: request.params.id, customerId },
      select: { toolType: true },
    })

    if (!canvas) {
      return reply.status(404).send({ error: 'Configuration canvas not found' })
    }

    const appId = await resolveAppIdForToolType(canvas.toolType)
    return hasAppPermission(appId, 'configuration-canvas', action)(request, reply)
  }
}

/**
 * Guard for POST / (create): there is no canvas row yet, so the app scope
 * is resolved from the validated request body's `toolType` instead of a DB
 * lookup. Schema validation runs before preHandlers in Fastify, so
 * `request.body.toolType` is guaranteed present here.
 */
export async function ensureCanvasCreatePermission(
  request: FastifyRequest<{ Body: { toolType?: string } }>,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  const toolType = request.body?.toolType ?? ''
  const appId = await resolveAppIdForToolType(toolType)
  return hasAppPermission(appId, 'configuration-canvas', 'write')(request, reply)
}

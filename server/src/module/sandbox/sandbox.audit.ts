// ========================================================================
// Sandbox Audit
//
// Records sandbox lifecycle events (create / delete / expire / run) into
// the tenant Audit Logs trail — `AuditEvent` — via the shared
// `recordAuditEvent` helper (lib/audit-event.ts), the SAME helper every
// other Community Edition module uses (see core/app-engine/app-management.route.ts
// and module/auth/auth.controller.ts). Writes are best-effort: a failed
// audit write must never fail the calling sandbox operation.
//
// ADAPTATION NOTE (source vs. Community Edition): the private, multi-tenant
// source module wrote to `PlatformAuditLog`, a hosted-platform-only table
// (required `adminUserId` FK to User, plus a `targetCustomerId` column for
// cross-tenant platform-ops views) that master-plan §2.4 explicitly EXCLUDES
// from the Community schema (it has no `Organization` self-hosted
// equivalent). The Community schema's tenant audit trail is `AuditEvent`
// (see prisma/schema.prisma), whose `userId` column is NULLABLE — so unlike
// the source, which had to fall back to structured-log-only recording when
// no real User row existed (API-key/CLI actions, the system TTL-expiry job —
// see its docblock: "a dedicated system-actor column is tracked for
// S4/A3"), every sandbox action here is recorded as a first-class AuditEvent
// row, with `userId: null` for system/API-key actors. This closes the exact
// gap the source's own comment flagged as future work; no functionality is
// dropped, and CLI-driven sandbox activity — the primary way this feature is
// used — is now actually visible in the tenant's Audit Logs report.
// ========================================================================

import { recordAuditEvent } from '../../lib/audit-event'
import { loggerService } from '../logger/logger.service'

export type SandboxAuditAction =
  | 'sandbox.create'
  | 'sandbox.delete'
  | 'sandbox.expire'
  | 'sandbox.run'

export interface SandboxAuditParams {
  action: SandboxAuditAction
  /** Real portal user id, or null when the actor is an API key / the system. */
  actorUserId: string | null
  /** Fallback actor: the sandbox creator (may also be null for CLI-created sandboxes). */
  createdById?: string | null
  customerId: string
  sandboxId: string
  details?: Record<string, unknown>
  result?: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
}

export async function writeSandboxAudit(params: SandboxAuditParams): Promise<void> {
  const {
    action,
    actorUserId,
    createdById,
    customerId,
    sandboxId,
    details,
    result = 'SUCCESS',
    errorMessage,
  } = params

  const auditUserId = actorUserId ?? createdById ?? null

  try {
    await recordAuditEvent({
      customerId,
      userId: auditUserId,
      action,
      resourceType: 'sandbox',
      resourceId: sandboxId,
      status: result === 'SUCCESS' ? 'success' : 'failure',
      details: {
        ...details,
        actor: actorUserId ? 'user' : auditUserId ? 'system-or-api-key' : 'system',
        ...(errorMessage ? { errorMessage } : {}),
      },
    })
  } catch (error) {
    // recordAuditEvent already swallows its own errors (best-effort); this
    // catch is defence in depth so an audit failure can never break the
    // calling sandbox operation.
    loggerService.warn(`Sandbox audit write failed for ${action} (non-fatal):`, error)
  }
}

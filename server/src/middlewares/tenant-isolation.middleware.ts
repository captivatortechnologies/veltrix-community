// ========================================================================
// Tenant Isolation Middleware — Community Edition (billing-free, no-op)
//
// In the private/hosted source this file mixed pure tenant-ownership
// helpers with commercial subscription-tier/billing enforcement
// (Stripe-backed trial gating, per-tier quotas). Community Edition ships
// every pipeline feature FREE and has no Subscription model in its Prisma
// schema at all, so the billing/tier logic cannot (and must not) exist
// here.
//
// The four exports below — `checkTenantQuota`, `requireTierFeature`,
// `TIER_LIMITS`, `getTierLimits`/`getEffectiveLimits` — are kept ONLY so
// the KEEP routes that already import them from this exact path compile
// and run completely unmodified:
//   - module/component/component.route.ts   -> checkTenantQuota('components')
//   - core/app-engine/app-management.route.ts -> checkTenantQuota('apps')
//   - module/role/role.route.ts              -> requireTierFeature('accessManagementEnabled')
//   - module/oidc/oidc.route.ts               -> requireTierFeature('accessManagementEnabled')
//
// Every one of them is now a permissive no-op: quotas are unlimited and
// every tier feature is enabled. Gated behind the `billing` feature flag
// only so a hosted/commercial fork can drop a real Subscription-backed
// implementation in behind the exact same import path without touching
// any of the four call sites above.
//
// The OSS-pure tenant-*ownership* helpers (`ensureCanvasOwnership`,
// `ensureDeploymentOwnership`, `ensureDriftOwnership`,
// `tenantPipelineRateLimit`) used by the pipeline engine live in the
// separate `tenant-ownership.middleware.ts` in this same directory — that
// file has zero billing-shaped exports, by design, so the pipeline core
// never needs to import anything from this one.
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import { isFeatureEnabled } from '../config/feature-flags'

export type TenantQuotaResource = 'deployments' | 'canvases' | 'apps' | 'components' | 'users'

export type TierFeature =
  | 'accessManagementEnabled'
  | 'driftDetectionEnabled'
  | 'canaryEnabled'
  | 'blueGreenEnabled'
  | 'approvalWorkflowEnabled'

/**
 * Tenant-scoped resource quota check — Community Edition: always unlimited.
 *
 * A hosted/commercial build can replace this file (same path, same export
 * signature) with real Subscription-tier enforcement gated on
 * `isFeatureEnabled('billing')`; here `billing` always defaults to false
 * and there is no Subscription model to check against, so this is
 * unconditionally a no-op.
 */
export const checkTenantQuota = (_resource: TenantQuotaResource) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.customerId) {
      return reply.status(401).send({ error: 'Authentication required' })
    }
    // Community Edition: no quotas. `isFeatureEnabled('billing')` is
    // referenced here only to document the seam a hosted fork would use.
    void isFeatureEnabled('billing')
    return
  }
}

/**
 * Gate a route on a tier feature flag — Community Edition: every feature
 * is enabled for every tenant (all pipeline/RBAC/SSO features ship free).
 */
export const requireTierFeature = (_feature: TierFeature) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.customerId) {
      return reply.status(401).send({ error: 'Authentication required' })
    }
    void isFeatureEnabled('billing')
    return
  }
}

// --- Subscription Tier Limits (Community Edition: unlimited placeholder) ---

export interface TierLimits {
  maxConcurrentDeployments: number
  maxCanvases: number
  maxApps: number
  maxComponents: number
  maxEnvironments: number
  maxUsersPerOrg: number
  driftDetectionEnabled: boolean
  canaryEnabled: boolean
  blueGreenEnabled: boolean
  approvalWorkflowEnabled: boolean
  accessManagementEnabled: boolean
  auditRetentionDays: number
}

/** Per-tenant quota overrides — unused in Community Edition (no billing). */
export interface TierLimitOverrides {
  maxUsers?: number | null
  maxTools?: number | null
  maxComponents?: number | null
}

const UNLIMITED_TIER_LIMITS: TierLimits = {
  maxConcurrentDeployments: Number.MAX_SAFE_INTEGER,
  maxCanvases: Number.MAX_SAFE_INTEGER,
  maxApps: Number.MAX_SAFE_INTEGER,
  maxComponents: Number.MAX_SAFE_INTEGER,
  maxEnvironments: Number.MAX_SAFE_INTEGER,
  maxUsersPerOrg: Number.MAX_SAFE_INTEGER,
  driftDetectionEnabled: true,
  canaryEnabled: true,
  blueGreenEnabled: true,
  approvalWorkflowEnabled: true,
  accessManagementEnabled: true,
  auditRetentionDays: Number.MAX_SAFE_INTEGER,
}

/**
 * All tier names resolve to the same unlimited limits — there is no
 * Subscription/tier ladder in Community Edition.
 */
export const TIER_LIMITS: Record<string, TierLimits> = new Proxy(
  {},
  { get: () => UNLIMITED_TIER_LIMITS, has: () => true },
) as Record<string, TierLimits>

export function getTierLimits(_tier?: string): TierLimits {
  return UNLIMITED_TIER_LIMITS
}

export function getEffectiveLimits(_tier?: string, _overrides?: TierLimitOverrides): TierLimits {
  return UNLIMITED_TIER_LIMITS
}

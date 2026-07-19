// ========================================================================
// Tenant Ownership & Rate-Limiting Middleware (billing-free)
//
// Pure tenant-scoping helpers used by the Security-as-Code pipeline
// (core/pipeline-engine/pipeline.route.ts): they verify a canvas/deployment/
// drift record belongs to the requesting user's tenant, and provide a
// per-tenant in-memory rate limit for pipeline write operations. NONE of
// this file touches billing, subscription tiers, or Stripe — it has no
// commercial coupling whatsoever, which is why it is split out from
// tenant-isolation.middleware.ts (that file now holds ONLY the no-op
// billing/tier stubs kept for import compatibility with a few unrelated
// routes — see the comment there).
//
// Import contract (do not rename without updating consumers):
//   import {
//     ensureCanvasOwnership,
//     ensureDeploymentOwnership,
//     ensureDriftOwnership,
//     tenantPipelineRateLimit,
//   } from '../../middlewares/tenant-ownership.middleware'
// ========================================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../db'
import { loggerService } from '../module/logger/logger.service'

// core/app-engine/app-management.route.ts imports `checkTenantQuota` from
// THIS path rather than from tenant-isolation.middleware.ts. Both import
// conventions exist across the KEEP routes (component/role/oidc import it
// from tenant-isolation.middleware.ts directly), so re-export the no-op
// stub here too — the canonical implementation stays in
// tenant-isolation.middleware.ts (the file that actually reasons about
// billing/tiers, even if only as a no-op); this is purely a path alias so
// neither route file needs to change.
export { checkTenantQuota, requireTierFeature, TIER_LIMITS, getTierLimits, getEffectiveLimits } from './tenant-isolation.middleware'

/**
 * Validates that a canvas belongs to the user's tenant before allowing
 * pipeline operations (validate, deploy, etc.).
 */
export const ensureCanvasOwnership = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const customerId = request.user?.customerId
  const canvasId = request.params.id

  if (!customerId || !canvasId) {
    return reply.status(401).send({ error: 'Authentication required' })
  }

  const canvas = await prisma.configurationCanvas.findFirst({
    where: { id: canvasId, customerId },
    select: { id: true },
  })

  if (!canvas) {
    loggerService.warn(`[TenantOwnership] Canvas ${canvasId} access denied for customer ${customerId}`)
    return reply.status(404).send({ error: 'Canvas not found' })
  }
}

/**
 * Validates that a deployment belongs to the user's tenant.
 */
export const ensureDeploymentOwnership = async (
  request: FastifyRequest<{ Params: { deploymentId: string } }>,
  reply: FastifyReply,
) => {
  const customerId = request.user?.customerId
  const deploymentId = request.params.deploymentId

  if (!customerId || !deploymentId) {
    return reply.status(401).send({ error: 'Authentication required' })
  }

  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, customerId },
    select: { id: true },
  })

  if (!deployment) {
    loggerService.warn(`[TenantOwnership] Deployment ${deploymentId} access denied for customer ${customerId}`)
    return reply.status(404).send({ error: 'Deployment not found' })
  }
}

/**
 * Validates that a drift record belongs to the user's tenant.
 */
export const ensureDriftOwnership = async (
  request: FastifyRequest<{ Params: { driftId: string } }>,
  reply: FastifyReply,
) => {
  const customerId = request.user?.customerId
  const driftId = request.params.driftId

  if (!customerId || !driftId) {
    return reply.status(401).send({ error: 'Authentication required' })
  }

  const drift = await prisma.driftRecord.findFirst({
    where: { id: driftId, customerId },
    select: { id: true },
  })

  if (!drift) {
    loggerService.warn(`[TenantOwnership] Drift ${driftId} access denied for customer ${customerId}`)
    return reply.status(404).send({ error: 'Drift record not found' })
  }
}

/**
 * Rate limiter per tenant for pipeline operations.
 * Prevents a single tenant from overwhelming shared resources.
 */
const tenantRateLimits = new Map<string, { count: number; resetAt: number }>()

export const tenantPipelineRateLimit = (maxOpsPerMinute = 30) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const customerId = request.user?.customerId
    if (!customerId) return reply.status(401).send({ error: 'Authentication required' })

    const now = Date.now()
    const entry = tenantRateLimits.get(customerId)

    if (!entry || now >= entry.resetAt) {
      tenantRateLimits.set(customerId, { count: 1, resetAt: now + 60_000 })
      return
    }

    entry.count++
    if (entry.count > maxOpsPerMinute) {
      loggerService.warn(`[TenantOwnership] Rate limit exceeded for customer ${customerId}`)
      return reply.status(429).send({
        error: 'Pipeline rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      })
    }
  }
}

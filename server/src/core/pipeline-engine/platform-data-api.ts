// ========================================================================
// Platform Data API
//
// Tenant-scoped, read-only data access handed to app pipeline handlers
// as `ctx.platform`. This is the supported boundary between apps and
// platform data: apps must never import the platform's Prisma client.
// Keep this surface narrow — every addition becomes a public app contract.
// ========================================================================

import { PrismaClient, DeploymentStatus } from '@prisma/client'
import type { PlatformDataApi, DeploymentSummary, ComponentRef } from './types'

export function createPlatformDataApi(db: PrismaClient, customerId: string): PlatformDataApi {
  return {
    async getLatestDeployment(
      canvasId: string,
      opts?: { status?: string },
    ): Promise<DeploymentSummary | null> {
      const deployment = await db.deployment.findFirst({
        where: {
          canvasId,
          customerId,
          ...(opts?.status ? { status: opts.status as DeploymentStatus } : {}),
        },
        orderBy: { completedAt: 'desc' },
        include: {
          environment: { select: { id: true, name: true } },
        },
      })

      if (!deployment) return null

      return {
        id: deployment.id,
        canvasId: deployment.canvasId,
        status: deployment.status,
        healthScore: deployment.healthScore,
        startedAt: deployment.startedAt.toISOString(),
        completedAt: deployment.completedAt?.toISOString() ?? null,
        environment: { id: deployment.environment.id, name: deployment.environment.name },
      }
    },

    async listComponents(filter?: { types?: string[] }): Promise<ComponentRef[]> {
      const components = await db.component.findMany({
        where: {
          customerId,
          ...(filter?.types?.length ? { type: { hasSome: filter.types } } : {}),
        },
        select: { id: true, hostname: true, port: true, type: true, toolId: true },
      })

      return components
    },
  }
}

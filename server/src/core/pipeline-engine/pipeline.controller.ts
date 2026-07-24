import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../../db'
import { loggerService } from '../../module/logger/logger.service'
import { getPipelineService, getDriftDetector, getJobRunner } from '../platform-bootstrap'
import { DRIFT_CANVAS_QUEUE } from './drift.jobs'
import type { DeploymentStrategy } from '../../../../shared/types/pipeline'

/**
 * Attach a lightweight `component { id, hostname }` onto drift records. The
 * DriftRecord model stores only a bare `componentId` (no relation), so the client
 * — which renders `drift.component.hostname` — would otherwise see it undefined.
 * Batched to one query regardless of record count.
 */
async function withComponents<T extends { componentId: string | null }>(
  records: T[],
): Promise<Array<T & { component: { id: string; hostname: string } | null }>> {
  const ids = [...new Set(records.map((r) => r.componentId).filter((v): v is string => Boolean(v)))]
  const byId = new Map<string, { id: string; hostname: string }>()
  if (ids.length > 0) {
    const comps = await prisma.component.findMany({
      where: { id: { in: ids } },
      select: { id: true, hostname: true },
    })
    for (const c of comps) byId.set(c.id, c)
  }
  return records.map((r) => ({
    ...r,
    component: r.componentId ? byId.get(r.componentId) ?? null : null,
  }))
}

/** Drift records relevant to one canvas: same app + config type, in any env it was deployed to. */
async function driftRecordsForCanvas(customerId: string, canvasId: string) {
  const canvas = await prisma.configurationCanvas.findFirst({
    where: { id: canvasId, customerId },
    select: { toolType: true, entityType: true },
  })
  if (!canvas) return null

  const envs = await prisma.deployment.findMany({
    where: { canvasId, customerId, status: 'SUCCEEDED' },
    distinct: ['environmentId'],
    select: { environmentId: true },
  })
  const environmentIds = envs.map((e) => e.environmentId)
  if (environmentIds.length === 0) return []

  const records = await prisma.driftRecord.findMany({
    where: {
      customerId,
      appId: canvas.toolType,
      configTypeId: canvas.entityType,
      environmentId: { in: environmentIds },
    },
    orderBy: { detectedAt: 'desc' },
    include: { environment: { select: { id: true, name: true } } },
  })
  return withComponents(records)
}

// --- Request Types ---

interface IdParams {
  id: string
}

interface DeploymentIdParams {
  deploymentId: string
}

interface DeployBody {
  environmentId: string
  strategy?: DeploymentStrategy
}

interface RollbackBody {
  reason: string
}

interface PromoteBody {
  targetEnvironmentId: string
}

interface DriftQuery {
  environmentId?: string
  isResolved?: boolean
  page?: number
  limit?: number
}

export const pipelineController = {
  validate: async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.id) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const result = await getPipelineService().validate(request.params.id, request.user.id)
      reply.send(result)
    } catch (error) {
      loggerService.error('Error validating canvas:', error)
      if (error instanceof Error && error.message.includes('must be in DRAFT')) {
        return reply.status(400).send({ error: error.message })
      }
      reply.status(500).send({ error: 'Error validating canvas' })
    }
  },

  deploy: async (
    request: FastifyRequest<{ Params: IdParams; Body: DeployBody }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.id) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const { environmentId, strategy } = request.body
      const deploymentId = await getPipelineService().deploy(
        request.params.id,
        environmentId,
        request.user.id,
        strategy,
      )

      reply.status(201).send({ deploymentId })
    } catch (error) {
      loggerService.error('Error deploying canvas:', error)
      if (error instanceof Error) {
        if (
          error.message.includes('must be APPROVED') ||
          error.message.includes('must be successfully deployed') ||
          error.message.includes('no version history')
        ) {
          return reply.status(400).send({ error: error.message })
        }
      }
      reply.status(500).send({ error: 'Error deploying canvas' })
    }
  },

  rollback: async (
    request: FastifyRequest<{ Params: DeploymentIdParams; Body: RollbackBody }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.id) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const rollbackId = await getPipelineService().rollback(
        request.params.deploymentId,
        request.user.id,
        request.body.reason,
      )

      reply.status(201).send({ deploymentId: rollbackId })
    } catch (error) {
      loggerService.error('Error rolling back deployment:', error)
      if (error instanceof Error && error.message.includes('No previous deployment')) {
        return reply.status(400).send({ error: error.message })
      }
      reply.status(500).send({ error: 'Error rolling back deployment' })
    }
  },

  pauseDeployment: async (
    request: FastifyRequest<{ Params: DeploymentIdParams }>,
    reply: FastifyReply,
  ) => {
    try {
      await getPipelineService().pauseDeployment(request.params.deploymentId)
      reply.send({ message: 'Deployment paused' })
    } catch (error) {
      loggerService.error('Error pausing deployment:', error)
      reply.status(500).send({ error: 'Error pausing deployment' })
    }
  },

  resumeDeployment: async (
    request: FastifyRequest<{ Params: DeploymentIdParams }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.id) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      await getPipelineService().resumeDeployment(request.params.deploymentId, request.user.id)
      reply.send({ message: 'Deployment resumed' })
    } catch (error) {
      loggerService.error('Error resuming deployment:', error)
      if (error instanceof Error && error.message.includes('not paused')) {
        return reply.status(400).send({ error: error.message })
      }
      reply.status(500).send({ error: 'Error resuming deployment' })
    }
  },

  promote: async (
    request: FastifyRequest<{ Params: DeploymentIdParams; Body: PromoteBody }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.id) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const deploymentId = await getPipelineService().promote(
        request.params.deploymentId,
        request.body.targetEnvironmentId,
        request.user.id,
      )

      reply.status(201).send({ deploymentId })
    } catch (error) {
      loggerService.error('Error promoting deployment:', error)
      if (error instanceof Error && error.message.includes('only promote succeeded')) {
        return reply.status(400).send({ error: error.message })
      }
      reply.status(500).send({ error: 'Error promoting deployment' })
    }
  },

  getDeploymentStatus: async (
    request: FastifyRequest<{ Params: DeploymentIdParams }>,
    reply: FastifyReply,
  ) => {
    try {
      const deployment = await getPipelineService().getDeploymentStatus(request.params.deploymentId)
      reply.send(deployment)
    } catch (error) {
      loggerService.error('Error fetching deployment status:', error)
      reply.status(500).send({ error: 'Error fetching deployment status' })
    }
  },

  getDeployments: async (
    request: FastifyRequest<{ Params: IdParams; Querystring: { limit?: number } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const deployments = await prisma.deployment.findMany({
        where: {
          canvasId: request.params.id,
          customerId: request.user.customerId,
        },
        orderBy: { startedAt: 'desc' },
        take: request.query.limit || 20,
        include: {
          environment: { select: { id: true, name: true } },
          triggeredBy: { select: { id: true, name: true, email: true } },
        },
      })

      reply.send(deployments)
    } catch (error) {
      loggerService.error('Error fetching deployments:', error)
      reply.status(500).send({ error: 'Error fetching deployments' })
    }
  },

  getPipelineSummary: async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const summary = await getPipelineService().getPipelineSummary(request.user.customerId)
      reply.send(summary)
    } catch (error) {
      loggerService.error('Error fetching pipeline summary:', error)
      reply.status(500).send({ error: 'Error fetching pipeline summary' })
    }
  },

  getDriftRecords: async (
    request: FastifyRequest<{ Querystring: DriftQuery }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const { environmentId, isResolved, page = 1, limit = 20 } = request.query

      const where: Record<string, unknown> = { customerId: request.user.customerId }
      if (environmentId) where.environmentId = environmentId
      if (isResolved !== undefined) where.isResolved = isResolved

      const [records, total] = await Promise.all([
        prisma.driftRecord.findMany({
          where,
          orderBy: { detectedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            environment: { select: { id: true, name: true } },
          },
        }),
        prisma.driftRecord.count({ where }),
      ])

      reply.send({
        data: await withComponents(records),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    } catch (error) {
      loggerService.error('Error fetching drift records:', error)
      reply.status(500).send({ error: 'Error fetching drift records' })
    }
  },

  /**
   * On-demand drift detection ("Check drift now"). Runs inline (no queue) so the
   * caller gets fresh records back immediately. With an environmentId, checks that
   * environment; otherwise every environment the tenant has deployed to.
   */
  detectDrift: async (
    request: FastifyRequest<{ Body: { environmentId?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }
      const customerId = request.user.customerId
      const environmentId = request.body?.environmentId

      if (environmentId) await getDriftDetector().detectAll(customerId, environmentId)
      else await getDriftDetector().detectForCustomer(customerId)

      const where: Record<string, unknown> = { customerId, isResolved: false }
      if (environmentId) where.environmentId = environmentId
      const [records, unresolved] = await Promise.all([
        prisma.driftRecord.findMany({
          where,
          orderBy: { detectedAt: 'desc' },
          take: 50,
          include: { environment: { select: { id: true, name: true } } },
        }),
        prisma.driftRecord.count({ where }),
      ])
      reply.send({ checked: true, unresolved, data: await withComponents(records) })
    } catch (error) {
      loggerService.error('Error running drift detection:', error)
      reply.status(500).send({ error: 'Error running drift detection' })
    }
  },

  /** Drift records for a single configuration (used by the config view modal's Drift tab). */
  getCanvasDrift: async (
    request: FastifyRequest<{ Params: { canvasId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }
      const customerId = request.user.customerId
      const canvasId = request.params.canvasId
      const records = await driftRecordsForCanvas(customerId, canvasId)
      if (records === null) return reply.status(404).send({ error: 'Configuration not found' })
      // Surface the async check state so the client can poll "checking → done".
      const canvas = await prisma.configurationCanvas.findFirst({
        where: { id: canvasId, customerId },
        select: { driftCheckState: true, lastDriftCheckAt: true },
      })
      reply.send({ data: records, checkState: canvas?.driftCheckState ?? 'IDLE', lastDriftCheckAt: canvas?.lastDriftCheckAt ?? null })
    } catch (error) {
      loggerService.error('Error fetching canvas drift:', error)
      reply.status(500).send({ error: 'Error fetching canvas drift' })
    }
  },

  /** On-demand drift check for a single configuration, then return its drift records. */
  checkCanvasDrift: async (
    request: FastifyRequest<{ Params: { canvasId: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }
      const customerId = request.user.customerId
      const { canvasId } = request.params
      const canvas = await prisma.configurationCanvas.findFirst({
        where: { id: canvasId, customerId },
        select: { id: true },
      })
      if (!canvas) return reply.status(404).send({ error: 'Configuration not found' })

      // Run the check ASYNCHRONOUSLY: a managed-ZTNA check hashes files over SSH
      // and can run audit searches — too slow for a synchronous request (it 504'd
      // at the gateway). Mark CHECKING, enqueue, and return immediately; the
      // client polls the drift status (checkState → IDLE) for the result.
      try {
        await prisma.configurationCanvas.update({ where: { id: canvasId }, data: { driftCheckState: 'CHECKING' } })
        await getJobRunner().enqueue(DRIFT_CANVAS_QUEUE, { customerId, canvasId })
        return reply.status(202).send({ queued: true, checkState: 'CHECKING' })
      } catch (enqueueError) {
        // No JobRunner/Redis — fall back to an inline check so the feature still
        // works in a single-process/dev setup (may be slow, but never lost).
        loggerService.warn('Drift check could not be queued; running inline:', enqueueError)
        await getDriftDetector().detectForCanvasAndFinalize(customerId, canvasId)
        const records = await driftRecordsForCanvas(customerId, canvasId)
        return reply.send({ checked: true, data: records ?? [] })
      }
    } catch (error) {
      loggerService.error('Error checking canvas drift:', error)
      reply.status(500).send({ error: 'Error checking canvas drift' })
    }
  },

  getEnvironmentMatrix: async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const customerId = request.user.customerId

      // Get all environment tags for this customer
      const environments = await prisma.tag.findMany({
        where: { customerId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      // Get all canvases with their latest deployment per environment
      const canvases = await prisma.configurationCanvas.findMany({
        where: { customerId },
        select: {
          id: true,
          name: true,
          toolType: true,
          entityType: true,
          status: true,
          version: true,
        },
        orderBy: { updatedAt: 'desc' },
      })

      // Get latest deployment for each canvas+environment combination
      const deployments = await prisma.deployment.findMany({
        where: { customerId },
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          canvasId: true,
          environmentId: true,
          status: true,
          strategy: true,
          healthScore: true,
          startedAt: true,
          completedAt: true,
          appId: true,
        },
      })

      // Build the matrix: for each canvas, find its latest deployment per environment
      const latestByCanvasEnv = new Map<string, typeof deployments[0]>()
      for (const d of deployments) {
        const key = `${d.canvasId}:${d.environmentId}`
        if (!latestByCanvasEnv.has(key)) {
          latestByCanvasEnv.set(key, d)
        }
      }

      const matrix = canvases.map((canvas) => ({
        canvas: {
          id: canvas.id,
          name: canvas.name,
          toolType: canvas.toolType,
          entityType: canvas.entityType,
          status: canvas.status,
          version: canvas.version,
        },
        environments: environments.map((env) => {
          const dep = latestByCanvasEnv.get(`${canvas.id}:${env.id}`)
          return {
            environmentId: env.id,
            environmentName: env.name,
            deployment: dep
              ? {
                  id: dep.id,
                  status: dep.status,
                  strategy: dep.strategy,
                  healthScore: dep.healthScore,
                  startedAt: dep.startedAt,
                  completedAt: dep.completedAt,
                }
              : null,
          }
        }),
      }))

      reply.send({ environments, matrix })
    } catch (error) {
      loggerService.error('Error fetching environment matrix:', error)
      reply.status(500).send({ error: 'Error fetching environment matrix' })
    }
  },

  resolveDrift: async (
    request: FastifyRequest<{ Params: { driftId: string }; Body: { action: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!request.user?.customerId) {
        return reply.status(401).send({ error: 'Authentication required' })
      }

      const record = await prisma.driftRecord.update({
        where: { id: request.params.driftId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedAction: request.body.action,
        },
      })

      reply.send(record)
    } catch (error) {
      loggerService.error('Error resolving drift record:', error)
      reply.status(500).send({ error: 'Error resolving drift record' })
    }
  },
}

// ========================================================================
// Pipeline Service - The core orchestrator for Security-as-Code
//
// This service coordinates the full lifecycle:
//   Author -> Validate -> Approve -> Deploy -> Monitor -> Drift Detect
//
// Apps provide handlers; this engine calls them in the right order
// with the right context, strategies, and rollback guarantees.
// ========================================================================

import { PrismaClient } from '@prisma/client'
import type {
  ValidateJobData,
  DeployJobData,
  RollbackJobData,
  PipelineHandlers,
  PipelineContext,
  CanvasSnapshot,
  EnvironmentRef,
  UserRef,
} from './types'
import type { ValidationResult, DeploymentStrategy } from '../../../../shared/types/pipeline'
import { createPlatformDataApi } from './platform-data-api'
import { toCanvasItems } from './canvasSnapshot'
import { resolvePermissionSnapshotForUser } from '../../lib/permissions'
import { resolveConnectionForConfigType } from './connection-resolver'
import { ticketingService } from '../../module/ticketing/ticketing.service'

export class PipelineService {
  constructor(
    private db: PrismaClient,
    private getHandlers: (appId: string, configTypeId: string) => PipelineHandlers | null,
    private enqueueJob: (queue: string, data: unknown) => Promise<void>,
  ) {}

  // ------------------------------------------------------------------
  // VALIDATE: Run app's validator on a canvas before approval
  // ------------------------------------------------------------------
  async validate(canvasId: string, userId: string): Promise<ValidationResult> {
    const canvas = await this.db.configurationCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      include: { sections: { include: { fields: true } }, tags: true },
    })

    if (canvas.status !== 'DRAFT' && canvas.status !== 'VALIDATION_FAILED') {
      throw new Error(`Canvas must be in DRAFT or VALIDATION_FAILED to validate. Current: ${canvas.status}`)
    }

    // Update status to VALIDATION_PENDING
    await this.db.configurationCanvas.update({
      where: { id: canvasId },
      data: { status: 'VALIDATION_PENDING' },
    })

    const handlers = this.getHandlers(canvas.toolType, canvas.entityType)
    if (!handlers) {
      // No app registered for this toolType/entityType - skip validation
      await this.db.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'DRAFT' },
      })
      return { valid: true, errors: [], warnings: [] }
    }

    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } })
    const snapshot = this.buildCanvasSnapshot(canvas)
    const environment = await this.resolveEnvironment(canvas)
    const ctx = await this.buildPipelineContext(canvas, snapshot, environment, user)

    // Best-effort: give validate the same connection deploy will use, so a
    // validator can do LIVE checks (e.g. verify referenced ids exist in the
    // target system). If nothing is registered, validate runs static-only.
    try {
      const conn = await resolveConnectionForConfigType(canvas.customerId, canvas.toolType, canvas.entityType)
      ctx.component = conn.component
      ctx.credential = conn.credential
    } catch {
      // best-effort — validate stays static-only if resolution fails
    }

    try {
      const result = await handlers.validate(ctx)

      await this.db.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: result.valid ? 'DRAFT' : 'VALIDATION_FAILED' },
      })

      // Reflect the validate outcome onto any linked ticket (best-effort, async).
      void ticketingService
        .reflectActivity(
          canvasId,
          canvas.customerId,
          result.valid
            ? `Validation passed for "${canvas.name}"`
            : `Validation failed for "${canvas.name}" (${result.errors.length} issue(s))`,
        )
        .catch(() => {})

      return result
    } catch (err) {
      await this.db.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'VALIDATION_FAILED' },
      })
      throw err
    }
  }

  // ------------------------------------------------------------------
  // SUBMIT FOR APPROVAL: Validate first, then move to pending approval
  // ------------------------------------------------------------------
  async submitForApproval(
    canvasId: string,
    userId: string,
    approvers: Array<{ approverId: string; environmentTagIds: string[] }>,
    submissionComment?: string,
  ): Promise<void> {
    const canvas = await this.db.configurationCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      include: { sections: { include: { fields: true } }, tags: true },
    })

    if (canvas.status !== 'DRAFT' && canvas.status !== 'VALIDATION_FAILED') {
      throw new Error(`Canvas must be in DRAFT to submit for approval. Current: ${canvas.status}`)
    }

    // Run validation first
    const validationResult = await this.validate(canvasId, userId)
    if (!validationResult.valid) {
      throw new Error(
        `Validation failed: ${validationResult.errors.map((e) => e.message).join(', ')}`,
      )
    }

    // Check environment policy for approval requirements
    const policy = await this.getEnvironmentPolicy(canvas)
    if (policy && !policy.requireApproval) {
      // Auto-approve if policy says no approval needed
      await this.db.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'APPROVED' },
      })
      await this.createHistoryEntry(canvasId, userId, 'APPROVED', 'Auto-approved by environment policy')
      return
    }

    // Create approval records
    await this.db.$transaction(async (tx) => {
      // Clear any existing approvals
      await tx.configurationCanvasApproval.deleteMany({ where: { canvasId } })

      for (const approver of approvers) {
        const approval = await tx.configurationCanvasApproval.create({
          data: {
            canvasId,
            approverId: approver.approverId,
            submissionComment,
          },
        })

        if (approver.environmentTagIds.length > 0) {
          await tx.configurationCanvasApprovalEnvironment.createMany({
            data: approver.environmentTagIds.map((tagId) => ({
              approvalId: approval.id,
              tagId,
            })),
          })
        }
      }

      await tx.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'PENDING_APPROVAL' },
      })
    })

    await this.createHistoryEntry(canvasId, userId, 'UPDATED', submissionComment || 'Submitted for approval')
  }

  // ------------------------------------------------------------------
  // APPROVE / REJECT
  // ------------------------------------------------------------------
  async approve(canvasId: string, userId: string, comment?: string): Promise<void> {
    const approval = await this.db.configurationCanvasApproval.findUnique({
      where: { canvasId_approverId: { canvasId, approverId: userId } },
    })

    if (!approval) {
      throw new Error('You are not assigned as an approver for this canvas')
    }

    if (approval.status !== 'PENDING') {
      throw new Error(`Approval already ${approval.status}`)
    }

    await this.db.configurationCanvasApproval.update({
      where: { id: approval.id },
      data: { status: 'APPROVED', comment, respondedAt: new Date() },
    })

    // Check if ALL approvers have approved
    const allApprovals = await this.db.configurationCanvasApproval.findMany({
      where: { canvasId },
    })

    const allApproved = allApprovals.every((a) => a.status === 'APPROVED')

    if (allApproved) {
      await this.db.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'APPROVED' },
      })
      await this.createHistoryEntry(canvasId, userId, 'APPROVED', 'All approvers approved')
    }
  }

  async reject(canvasId: string, userId: string, reason: string): Promise<void> {
    const approval = await this.db.configurationCanvasApproval.findUnique({
      where: { canvasId_approverId: { canvasId, approverId: userId } },
    })

    if (!approval) {
      throw new Error('You are not assigned as an approver for this canvas')
    }

    await this.db.$transaction(async (tx) => {
      await tx.configurationCanvasApproval.update({
        where: { id: approval.id },
        data: { status: 'REJECTED', comment: reason, respondedAt: new Date() },
      })

      // Any rejection reverts canvas to DRAFT
      await tx.configurationCanvas.update({
        where: { id: canvasId },
        data: { status: 'DRAFT' },
      })

      // Reset other pending approvals
      await tx.configurationCanvasApproval.updateMany({
        where: { canvasId, status: 'PENDING' },
        data: { status: 'PENDING' },
      })
    })

    await this.createHistoryEntry(canvasId, userId, 'REJECTED', reason)
  }

  // ------------------------------------------------------------------
  // DEPLOY: Queue a deployment job for a canvas
  // ------------------------------------------------------------------
  async deploy(
    canvasId: string,
    environmentId: string,
    triggeredById: string,
    strategyOverride?: DeploymentStrategy,
  ): Promise<string> {
    const canvas = await this.db.configurationCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      include: { sections: { include: { fields: true } }, tags: true, history: { orderBy: { version: 'desc' }, take: 1 } },
    })

    // APPROVED is the normal gate. DEPLOYED re-deploys the same config, and
    // DEPLOYMENT_FAILED / ROLLED_BACK let a failed or reverted deploy be retried
    // as-is (e.g. after fixing the cause in the target system) without a fresh
    // approval cycle. Editing the config instead resets it to DRAFT and forces
    // re-approval (see configuration-canvas.service.update).
    const DEPLOYABLE_STATUSES = ['APPROVED', 'DEPLOYED', 'DEPLOYMENT_FAILED', 'ROLLED_BACK']
    if (!DEPLOYABLE_STATUSES.includes(canvas.status)) {
      throw new Error(`Canvas must be approved (or a failed/rolled-back deploy) to deploy. Current: ${canvas.status}`)
    }

    // Check environment promotion requirement
    const policy = await this.getEnvironmentPolicyById(environmentId, canvas.customerId, canvas.toolType)
    if (policy?.requirePreviousEnv && policy.previousEnvTagId) {
      const previousDeployment = await this.db.deployment.findFirst({
        where: {
          canvasId,
          environmentId: policy.previousEnvTagId,
          status: 'SUCCEEDED',
        },
        orderBy: { completedAt: 'desc' },
      })
      if (!previousDeployment) {
        throw new Error('This configuration must be successfully deployed to the previous environment first')
      }
    }

    const strategy = strategyOverride || policy?.deploymentStrategy || 'ROLLING'
    const latestHistory = canvas.history[0]

    if (!latestHistory) {
      throw new Error('Canvas has no version history')
    }

    // Find previous deployment in this environment (for rollback reference)
    const previousDeployment = await this.db.deployment.findFirst({
      where: { canvasId, environmentId, status: 'SUCCEEDED' },
      orderBy: { completedAt: 'desc' },
    })

    // Create deployment record
    const deployment = await this.db.deployment.create({
      data: {
        canvasId,
        historyId: latestHistory.id,
        environmentId,
        customerId: canvas.customerId,
        appId: canvas.toolType,
        strategy,
        status: 'QUEUED',
        previousDeploymentId: previousDeployment?.id,
        triggeredById,
      },
    })

    // Update canvas status
    await this.db.configurationCanvas.update({
      where: { id: canvasId },
      data: { status: 'DEPLOYMENT_QUEUED' },
    })

    // Enqueue the deployment job
    const jobData: DeployJobData = {
      deploymentId: deployment.id,
      canvasId,
      historyId: latestHistory.id,
      environmentId,
      customerId: canvas.customerId,
      appId: canvas.toolType,
      configTypeId: canvas.entityType,
      strategy,
      triggeredById,
    }

    await this.enqueueJob('pipeline-deploy', jobData)
    await this.createHistoryEntry(canvasId, triggeredById, 'DEPLOYED', `Deployment queued to environment`)

    return deployment.id
  }

  // ------------------------------------------------------------------
  // ROLLBACK: Revert a deployment to the previous version
  // ------------------------------------------------------------------
  async rollback(deploymentId: string, userId: string, reason: string): Promise<string> {
    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: deploymentId },
    })

    if (!deployment.previousDeploymentId) {
      throw new Error('No previous deployment to rollback to')
    }

    // Create a new deployment record for the rollback
    const rollbackDeployment = await this.db.deployment.create({
      data: {
        canvasId: deployment.canvasId,
        historyId: deployment.historyId,
        environmentId: deployment.environmentId,
        customerId: deployment.customerId,
        appId: deployment.appId,
        strategy: 'DIRECT', // Rollbacks are always direct
        status: 'QUEUED',
        previousDeploymentId: deploymentId,
        triggeredById: userId,
      },
    })

    // Mark original as rolling back
    await this.db.deployment.update({
      where: { id: deploymentId },
      data: { status: 'ROLLING_BACK', rolledBackById: userId, rolledBackAt: new Date() },
    })

    const jobData: RollbackJobData = {
      deploymentId: rollbackDeployment.id,
      reason,
      triggeredById: userId,
    }

    await this.enqueueJob('pipeline-rollback', jobData)
    await this.createHistoryEntry(deployment.canvasId, userId, 'REVERTED', reason)

    return rollbackDeployment.id
  }

  // ------------------------------------------------------------------
  // PAUSE / RESUME a deployment in progress
  // ------------------------------------------------------------------
  async pauseDeployment(deploymentId: string): Promise<void> {
    await this.db.deployment.update({
      where: { id: deploymentId },
      data: { status: 'PAUSED' },
    })

    const deployment = await this.db.deployment.findUniqueOrThrow({ where: { id: deploymentId } })
    await this.db.configurationCanvas.update({
      where: { id: deployment.canvasId },
      data: { status: 'DEPLOYMENT_PAUSED' },
    })
  }

  async resumeDeployment(deploymentId: string, userId: string): Promise<void> {
    const deployment = await this.db.deployment.findUniqueOrThrow({ where: { id: deploymentId } })

    if (deployment.status !== 'PAUSED') {
      throw new Error(`Deployment is not paused. Current: ${deployment.status}`)
    }

    await this.db.deployment.update({
      where: { id: deploymentId },
      data: { status: 'IN_PROGRESS' },
    })

    await this.db.configurationCanvas.update({
      where: { id: deployment.canvasId },
      data: { status: 'DEPLOYING' },
    })

    // Re-enqueue the deployment job to continue
    await this.enqueueJob('pipeline-deploy', {
      deploymentId: deployment.id,
      canvasId: deployment.canvasId,
      historyId: deployment.historyId,
      environmentId: deployment.environmentId,
      customerId: deployment.customerId,
      appId: deployment.appId,
      configTypeId: '', // Will be resolved from canvas
      strategy: deployment.strategy,
      triggeredById: userId,
    } satisfies DeployJobData)
  }

  // ------------------------------------------------------------------
  // PROMOTE: Deploy to the next environment in the chain
  // ------------------------------------------------------------------
  async promote(
    deploymentId: string,
    targetEnvironmentId: string,
    userId: string,
  ): Promise<string> {
    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: deploymentId },
    })

    if (deployment.status !== 'SUCCEEDED') {
      throw new Error('Can only promote succeeded deployments')
    }

    return this.deploy(
      deployment.canvasId,
      targetEnvironmentId,
      userId,
    )
  }

  // ------------------------------------------------------------------
  // GET deployment status
  // ------------------------------------------------------------------
  async getDeploymentStatus(deploymentId: string) {
    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: deploymentId },
      include: {
        logs: { orderBy: { timestamp: 'desc' }, take: 50 },
        canvas: { select: { name: true, toolType: true, entityType: true } },
        environment: { select: { id: true, name: true } },
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    })
    // Surface the most recent error-log line as a top-level `error` so callers
    // (the deploy poll → failure modal) get the reason WHY, not just "FAILED".
    // Strip the internal "Deployment failed: " prefix the orchestrator adds.
    const errorLog = deployment.logs.find((l) => l.level === 'error')
    const error = errorLog ? errorLog.message.replace(/^Deployment failed:\s*/i, '') : null
    return { ...deployment, error }
  }

  // ------------------------------------------------------------------
  // GET pipeline overview for a customer
  // ------------------------------------------------------------------
  async getPipelineSummary(customerId: string) {
    const [pendingApprovals, activeDeployments, failedDeployments, unresolvedDrifts] =
      await Promise.all([
        this.db.configurationCanvas.count({
          where: { customerId, status: 'PENDING_APPROVAL' },
        }),
        this.db.deployment.count({
          where: { customerId, status: { in: ['QUEUED', 'IN_PROGRESS', 'HEALTH_CHECKING'] } },
        }),
        this.db.deployment.count({
          where: { customerId, status: 'FAILED' },
        }),
        this.db.driftRecord.count({
          where: { customerId, isResolved: false },
        }),
      ])

    return {
      pendingValidations: 0, // Validations are synchronous
      pendingApprovals,
      activeDeployments,
      failedDeployments,
      unresolvedDrifts,
    }
  }

  // ------------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------------

  private buildCanvasSnapshot(canvas: any): CanvasSnapshot {
    const items = toCanvasItems(canvas.sections)
    return {
      id: canvas.history?.[0]?.id || canvas.id,
      canvasId: canvas.id,
      version: canvas.version,
      name: canvas.name,
      toolType: canvas.toolType,
      entityType: canvas.entityType,
      items,
      sections: items,
      snapshot: canvas.history?.[0]?.snapshot || {},
    }
  }

  private async buildPipelineContext(
    canvas: any,
    snapshot: CanvasSnapshot,
    environment: EnvironmentRef,
    user: any,
  ): Promise<PipelineContext> {
    return {
      appId: canvas.toolType,
      customerId: canvas.customerId,
      configTypeId: canvas.entityType,
      canvas: snapshot,
      environment,
      user: { id: user.id, email: user.email, name: user.name },
      settings: {},
      platform: createPlatformDataApi(this.db, canvas.customerId),
      permissions: await resolvePermissionSnapshotForUser(user.id),
    }
  }

  private async resolveEnvironment(canvas: any): Promise<EnvironmentRef> {
    const canvasTags = canvas.tags || []
    if (canvasTags.length > 0) {
      const tag = await this.db.tag.findUnique({ where: { id: canvasTags[0].tagId } })
      if (tag) return { id: tag.id, name: tag.name }
    }
    return { id: 'default', name: 'default' }
  }

  private async getEnvironmentPolicy(canvas: any) {
    const canvasTags = canvas.tags || []
    if (canvasTags.length === 0) return null

    // App-specific policy first (appId = the app slug / canvas.toolType)...
    const appPolicy = await this.db.environmentPolicy.findUnique({
      where: {
        tagId_customerId_appId: {
          tagId: canvasTags[0].tagId,
          customerId: canvas.customerId,
          appId: canvas.toolType,
        },
      },
    })
    if (appPolicy) return appPolicy

    // ...then fall back to the global policy (stored with appId ''), so a
    // requireApproval set globally in the Environments UI is honored here.
    return this.db.environmentPolicy.findFirst({
      where: {
        tagId: canvasTags[0].tagId,
        customerId: canvas.customerId,
        appId: '',
      },
    })
  }

  private async getEnvironmentPolicyById(envId: string, customerId: string, appId: string) {
    // Try app-specific policy first, then global
    const appPolicy = await this.db.environmentPolicy.findUnique({
      where: { tagId_customerId_appId: { tagId: envId, customerId, appId } },
    })
    if (appPolicy) return appPolicy

    return this.db.environmentPolicy.findUnique({
      where: { tagId_customerId_appId: { tagId: envId, customerId, appId: '' } },
    })
  }

  private async createHistoryEntry(
    canvasId: string,
    userId: string,
    action: string,
    comment?: string,
  ) {
    const canvas = await this.db.configurationCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      include: { sections: { include: { fields: true } } },
    })

    await this.db.configurationCanvasHistory.create({
      data: {
        canvasId,
        version: canvas.version,
        action: action as any,
        snapshot: JSON.parse(JSON.stringify(canvas)),
        userId,
        comment,
      },
    })
  }
}

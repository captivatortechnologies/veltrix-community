// ========================================================================
// Deployment Orchestrator
//
// Executes deployment jobs by calling app pipeline handlers with the
// correct strategy (canary, blue-green, rolling, direct).
// Handles health checks, progress tracking, and auto-rollback.
// ========================================================================

import { PrismaClient } from '@prisma/client'
import type {
  DeployJobData,
  RollbackJobData,
  PipelineHandlers,
  DeployContext,
  RollbackContext,
  HealthCheckContext,
  ComponentRef,
  CredentialRef,
  ConnectivityRef,
  ConnectivityProviderRef,
  CanvasSnapshot,
} from './types'
import type { DeploymentStrategy } from '../../../../shared/types/pipeline'
import type { Prisma } from '@prisma/client'
import { createPlatformDataApi } from './platform-data-api'
import { toCanvasItems } from './canvasSnapshot'
import { decryptCredentialSecrets } from '../../module/credential/credential.service'
import { configurationHistoryService } from '../../module/configuration-history/configuration-history.service'
import { ConfigActionType } from '@prisma/client'
import { resolvePermissionSnapshotForUser } from '../../lib/permissions'
import { ticketingService } from '../../module/ticketing/ticketing.service'
import type { TicketStatusTransition } from '../../module/ticketing/adapters'

export class DeploymentOrchestrator {
  constructor(
    private db: PrismaClient,
    private getHandlers: (appId: string, configTypeId: string) => PipelineHandlers | null,
    private enqueueJob: (queue: string, data: unknown) => Promise<void>,
  ) {}

  // ------------------------------------------------------------------
  // EXECUTE DEPLOYMENT (called by BullMQ worker)
  // ------------------------------------------------------------------
  async executeDeployment(data: DeployJobData): Promise<void> {
    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: data.deploymentId },
    })

    // Skip if not in a deployable state (may have been cancelled/paused)
    if (deployment.status !== 'QUEUED' && deployment.status !== 'IN_PROGRESS') {
      return
    }

    const handlers = this.getHandlers(data.appId, data.configTypeId)
    if (!handlers) {
      const reason = 'No pipeline handlers registered for this app/config type'
      await this.failDeployment(data.deploymentId, reason)
      await this.updateCanvas(data.canvasId, 'DEPLOYMENT_FAILED', reason)
      return
    }

    try {
      // Mark as in progress — clear any prior failure reason so a retry starts clean.
      await this.updateDeployment(data.deploymentId, { status: 'IN_PROGRESS' })
      await this.updateCanvas(data.canvasId, 'DEPLOYING', null)

      // Get target components
      const components = await this.getTargetComponents(data)
      if (components.length === 0) {
        const reason = 'No target components found for this configuration'
        await this.failDeployment(data.deploymentId, reason)
        await this.updateCanvas(data.canvasId, 'DEPLOYMENT_FAILED', reason)
        return
      }

      await this.addLog(data.deploymentId, 'info', `Starting ${data.strategy} deployment to ${components.length} component(s)`)

      // Execute strategy
      switch (data.strategy) {
        case 'DIRECT':
          await this.executeDirect(data, handlers, components)
          break
        case 'ROLLING':
          await this.executeRolling(data, handlers, components)
          break
        case 'CANARY':
          await this.executeCanary(data, handlers, components)
          break
        case 'BLUE_GREEN':
          await this.executeBlueGreen(data, handlers, components)
          break
        default:
          await this.executeDirect(data, handlers, components)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown deployment error'
      await this.failDeployment(data.deploymentId, message)
      await this.updateCanvas(data.canvasId, 'DEPLOYMENT_FAILED', message)
      // Central configuration history so the Version History panel shows the
      // deploy failure alongside the other lifecycle actions. Best-effort.
      await this.recordDeployHistory(data, 'failed', `Deployment failed: ${message}`)
      // Change management: reflect the failure onto any linked ticket (best-effort).
      await this.reflectTicket(data, { outcome: 'deploy_failed', note: message })

      // Auto-rollback if policy says so
      await this.checkAutoRollback(data)
    }
  }

  // ------------------------------------------------------------------
  // EXECUTE ROLLBACK (called by BullMQ worker)
  // ------------------------------------------------------------------
  async executeRollback(data: RollbackJobData): Promise<void> {
    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: data.deploymentId },
      include: { canvas: true },
    })

    if (!deployment.previousDeploymentId) {
      await this.failDeployment(data.deploymentId, 'No previous deployment to rollback to')
      return
    }

    const previousDeployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: deployment.previousDeploymentId },
    })

    const handlers = this.getHandlers(deployment.appId, deployment.canvas.entityType)
    if (!handlers) {
      await this.failDeployment(data.deploymentId, 'No pipeline handlers for rollback')
      return
    }

    try {
      await this.updateDeployment(data.deploymentId, { status: 'IN_PROGRESS' })
      await this.addLog(data.deploymentId, 'info', `Starting rollback: ${data.reason}`)

      const components = await this.getTargetComponents({
        customerId: deployment.customerId,
        appId: deployment.appId,
        configTypeId: deployment.canvas.entityType,
      })

      const snapshot = await this.getCanvasSnapshot(deployment.canvasId, previousDeployment.historyId)

      for (const component of components) {
        const ctx = await this.buildRollbackContext(
          deployment,
          component,
          snapshot,
          previousDeployment.rollbackData,
        )

        const result = await handlers.rollback(ctx)
        if (!result.success) {
          await this.addLog(data.deploymentId, 'error', `Rollback failed on ${component.hostname}: ${result.message}`)
          throw new Error(`Rollback failed on ${component.hostname}: ${result.message}`)
        }

        await this.addLog(data.deploymentId, 'info', `Rolled back ${component.hostname} successfully`)
      }

      await this.updateDeployment(data.deploymentId, {
        status: 'ROLLED_BACK',
        completedAt: new Date(),
      })

      // Mark the original deployment as rolled back too
      await this.updateDeployment(deployment.previousDeploymentId, {
        status: 'ROLLED_BACK',
      })

      await this.updateCanvas(deployment.canvasId, 'ROLLED_BACK')
      await this.addLog(data.deploymentId, 'info', 'Rollback completed successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rollback failed'
      await this.failDeployment(data.deploymentId, message)
    }
  }

  // ------------------------------------------------------------------
  // STRATEGY: Direct (all at once, no health checks between)
  // ------------------------------------------------------------------
  private async executeDirect(
    data: DeployJobData,
    handlers: PipelineHandlers,
    components: ComponentRef[],
  ): Promise<void> {
    const snapshot = await this.getCanvasSnapshot(data.canvasId, data.historyId)

    for (const component of components) {
      const ctx = await this.buildDeployContext(data, component, snapshot)
      const result = await handlers.deploy(ctx)

      if (!result.success) {
        throw new Error(`Deploy failed on ${component.hostname}: ${result.message}`)
      }

      await this.addLog(data.deploymentId, 'info', `Deployed to ${component.hostname}: ${result.message}`)

      // Store rollback data
      if (result.rollbackData) {
        await this.db.deployment.update({
          where: { id: data.deploymentId },
          data: { rollbackData: result.rollbackData as Prisma.InputJsonValue },
        })
      }
    }

    // Final health check
    await this.runHealthChecks(data, handlers, components)
    await this.succeedDeployment(data)
  }

  // ------------------------------------------------------------------
  // STRATEGY: Rolling (one by one with health checks)
  // ------------------------------------------------------------------
  private async executeRolling(
    data: DeployJobData,
    handlers: PipelineHandlers,
    components: ComponentRef[],
  ): Promise<void> {
    const snapshot = await this.getCanvasSnapshot(data.canvasId, data.historyId)

    for (let i = 0; i < components.length; i++) {
      // Check if paused
      const current = await this.db.deployment.findUniqueOrThrow({ where: { id: data.deploymentId } })
      if (current.status === 'PAUSED') {
        await this.addLog(data.deploymentId, 'info', 'Deployment paused')
        return // Job will be re-enqueued on resume
      }

      const component = components[i]
      await this.addLog(data.deploymentId, 'info', `Rolling deploy ${i + 1}/${components.length}: ${component.hostname}`)

      const ctx = await this.buildDeployContext(data, component, snapshot)
      const result = await handlers.deploy(ctx)

      if (!result.success) {
        throw new Error(`Deploy failed on ${component.hostname}: ${result.message}`)
      }

      // Health check after each component
      const healthCtx = await this.buildHealthCheckContext(data, component)
      const health = await handlers.healthCheck(healthCtx)

      if (!health.healthy) {
        throw new Error(`Health check failed on ${component.hostname} (score: ${health.score})`)
      }

      await this.updateDeployment(data.deploymentId, {
        healthScore: health.score,
      })

      await this.addLog(data.deploymentId, 'info', `${component.hostname} healthy (score: ${health.score})`)
    }

    await this.succeedDeployment(data)
  }

  // ------------------------------------------------------------------
  // STRATEGY: Canary (progressive % of components)
  // ------------------------------------------------------------------
  private async executeCanary(
    data: DeployJobData,
    handlers: PipelineHandlers,
    components: ComponentRef[],
  ): Promise<void> {
    const policy = await this.getPolicy(data.environmentId, data.customerId, data.appId)
    const steps = policy?.canarySteps || [10, 25, 50, 100]
    const snapshot = await this.getCanvasSnapshot(data.canvasId, data.historyId)

    for (const percent of steps) {
      // Check if paused
      const current = await this.db.deployment.findUniqueOrThrow({ where: { id: data.deploymentId } })
      if (current.status === 'PAUSED') return

      const targetCount = Math.max(1, Math.ceil(components.length * (percent / 100)))
      const targetComponents = components.slice(0, targetCount)

      await this.addLog(data.deploymentId, 'info', `Canary ${percent}%: deploying to ${targetCount} component(s)`)
      await this.updateDeployment(data.deploymentId, { canaryPercent: percent })

      for (const component of targetComponents) {
        const ctx = await this.buildDeployContext(data, component, snapshot, percent)
        const result = await handlers.deploy(ctx)
        if (!result.success) {
          throw new Error(`Canary deploy failed on ${component.hostname}: ${result.message}`)
        }
      }

      // Health check at each canary step
      await this.updateDeployment(data.deploymentId, { status: 'HEALTH_CHECKING' })
      const healthResults = await this.runHealthChecks(data, handlers, targetComponents)

      if (!healthResults.healthy) {
        throw new Error(`Canary health check failed at ${percent}% (score: ${healthResults.score})`)
      }

      await this.addLog(data.deploymentId, 'info', `Canary ${percent}% healthy (score: ${healthResults.score})`)
      await this.updateDeployment(data.deploymentId, { status: 'IN_PROGRESS' })
    }

    await this.succeedDeployment(data)
  }

  // ------------------------------------------------------------------
  // STRATEGY: Blue-Green (deploy to new, health check, swap)
  // ------------------------------------------------------------------
  private async executeBlueGreen(
    data: DeployJobData,
    handlers: PipelineHandlers,
    components: ComponentRef[],
  ): Promise<void> {
    const snapshot = await this.getCanvasSnapshot(data.canvasId, data.historyId)

    // Phase 1: Deploy to all components (the "green" deployment)
    await this.addLog(data.deploymentId, 'info', 'Blue-green: deploying to green environment')
    for (const component of components) {
      const ctx = await this.buildDeployContext(data, component, snapshot)
      const result = await handlers.deploy(ctx)
      if (!result.success) {
        throw new Error(`Blue-green deploy failed on ${component.hostname}: ${result.message}`)
      }
    }

    // Phase 2: Health check the green deployment
    await this.addLog(data.deploymentId, 'info', 'Blue-green: running health checks on green')
    await this.updateDeployment(data.deploymentId, { status: 'HEALTH_CHECKING' })

    const healthResults = await this.runHealthChecks(data, handlers, components)
    if (!healthResults.healthy) {
      throw new Error(`Blue-green health check failed (score: ${healthResults.score}). Blue stays active.`)
    }

    // Phase 3: "Swap" - green is now live
    await this.addLog(data.deploymentId, 'info', `Blue-green: green is healthy (score: ${healthResults.score}), switching traffic`)
    await this.succeedDeployment(data)
  }

  // ------------------------------------------------------------------
  // HEALTH CHECK RUNNER
  // ------------------------------------------------------------------
  private async runHealthChecks(
    data: DeployJobData,
    handlers: PipelineHandlers,
    components: ComponentRef[],
  ): Promise<{ healthy: boolean; score: number }> {
    let totalScore = 0
    let allHealthy = true

    for (const component of components) {
      const ctx = await this.buildHealthCheckContext(data, component)
      const result = await handlers.healthCheck(ctx)
      totalScore += result.score
      if (!result.healthy) allHealthy = false

      for (const check of result.checks) {
        await this.addLog(
          data.deploymentId,
          check.passed ? 'info' : 'error',
          `Health [${component.hostname}] ${check.name}: ${check.passed ? 'PASS' : 'FAIL'} - ${check.message}`,
        )
      }
    }

    const avgScore = components.length > 0 ? totalScore / components.length : 0
    await this.updateDeployment(data.deploymentId, { healthScore: avgScore })

    return { healthy: allHealthy, score: avgScore }
  }

  // ------------------------------------------------------------------
  // AUTO-ROLLBACK CHECK
  // ------------------------------------------------------------------
  private async checkAutoRollback(data: DeployJobData): Promise<void> {
    const policy = await this.getPolicy(data.environmentId, data.customerId, data.appId)
    if (!policy?.autoRollbackOnError) return

    const deployment = await this.db.deployment.findUniqueOrThrow({
      where: { id: data.deploymentId },
    })

    if (!deployment.previousDeploymentId) {
      await this.addLog(data.deploymentId, 'warn', 'Auto-rollback: no previous deployment to rollback to')
      return
    }

    await this.addLog(data.deploymentId, 'info', 'Auto-rollback triggered by environment policy')

    await this.enqueueJob('pipeline-rollback', {
      deploymentId: data.deploymentId,
      reason: 'Auto-rollback triggered by deployment failure',
      triggeredById: data.triggeredById,
    } satisfies RollbackJobData)
  }

  // ------------------------------------------------------------------
  // CONTEXT BUILDERS
  // ------------------------------------------------------------------

  private async buildDeployContext(
    data: DeployJobData,
    component: ComponentRef,
    snapshot: CanvasSnapshot,
    canaryPercent?: number,
  ): Promise<DeployContext> {
    const { credential, connectivity, connectivityProvider } = await this.getComponentAccess(component.id)
    const user = await this.db.user.findUniqueOrThrow({ where: { id: data.triggeredById } })
    const env = await this.db.tag.findUniqueOrThrow({ where: { id: data.environmentId } })

    return {
      appId: data.appId,
      customerId: data.customerId,
      configTypeId: data.configTypeId,
      canvas: snapshot,
      environment: { id: env.id, name: env.name },
      user: { id: user.id, email: user.email, name: user.name },
      settings: {},
      platform: createPlatformDataApi(this.db, data.customerId),
      permissions: await resolvePermissionSnapshotForUser(user.id),
      component,
      credential,
      connectivity,
      connectivityProvider,
      previousConfig: await this.getPreviousConfig(data.deploymentId),
      strategy: data.strategy,
      canaryPercent,
    }
  }

  private async buildRollbackContext(
    deployment: { appId: string; customerId: string; environmentId: string; triggeredById: string; canvas?: { entityType: string } },
    component: ComponentRef,
    targetSnapshot: CanvasSnapshot,
    rollbackData: unknown,
  ): Promise<RollbackContext> {
    const { credential, connectivity, connectivityProvider } = await this.getComponentAccess(component.id)
    const env = await this.db.tag.findUniqueOrThrow({ where: { id: deployment.environmentId } })
    const user = await this.db.user.findUniqueOrThrow({ where: { id: deployment.triggeredById } })

    return {
      appId: deployment.appId,
      customerId: deployment.customerId,
      configTypeId: deployment.canvas?.entityType || '',
      canvas: targetSnapshot,
      environment: { id: env.id, name: env.name },
      user: { id: user.id, email: user.email, name: user.name },
      settings: {},
      platform: createPlatformDataApi(this.db, deployment.customerId),
      permissions: await resolvePermissionSnapshotForUser(user.id),
      component,
      credential,
      connectivity,
      connectivityProvider,
      rollbackData,
      targetVersion: targetSnapshot,
    }
  }

  private async buildHealthCheckContext(
    data: DeployJobData,
    component: ComponentRef,
  ): Promise<HealthCheckContext> {
    const { credential, connectivity, connectivityProvider } = await this.getComponentAccess(component.id)
    const user = await this.db.user.findUniqueOrThrow({ where: { id: data.triggeredById } })
    const env = await this.db.tag.findUniqueOrThrow({ where: { id: data.environmentId } })
    const snapshot = await this.getCanvasSnapshot(data.canvasId, data.historyId)

    return {
      appId: data.appId,
      customerId: data.customerId,
      configTypeId: data.configTypeId,
      canvas: snapshot,
      environment: { id: env.id, name: env.name },
      user: { id: user.id, email: user.email, name: user.name },
      settings: {},
      platform: createPlatformDataApi(this.db, data.customerId),
      permissions: await resolvePermissionSnapshotForUser(user.id),
      component,
      credential,
      connectivity,
      connectivityProvider,
    }
  }

  // ------------------------------------------------------------------
  // DATA HELPERS
  // ------------------------------------------------------------------

  private async getTargetComponents(data: { customerId: string; appId: string; configTypeId: string }): Promise<ComponentRef[]> {
    // `data.appId` is the app SLUG (canvas.toolType, e.g. 'crowdstrike-edr'), but
    // AppConfigurationType.appId stores the App UUID. Resolve the App by slug
    // first, then look up its config type to know which component types to target.
    const app = await this.db.app.findUnique({ where: { appId: data.appId } })
    const configType = app
      ? await this.db.appConfigurationType.findFirst({
          where: { appId: app.id, configTypeId: data.configTypeId },
        })
      : null

    if (!configType) {
      // Couldn't resolve the app/config type: preserve prior behavior (target all
      // of the customer's components) but log a warning so it's diagnosable.
      const { loggerService } = await import('../../module/logger/logger.service')
      loggerService.warn(
        `[deployment-orchestrator] Could not resolve component-type filter for app '${data.appId}' / configType '${data.configTypeId}' (customer ${data.customerId}); targeting ALL components`,
      )
    }

    const components = await this.db.component.findMany({
      where: {
        customerId: data.customerId,
        ...(configType?.componentTypes?.length
          ? { type: { hasSome: configType.componentTypes } }
          : {}),
      },
    })

    return components.map((c) => ({
      id: c.id,
      hostname: c.hostname,
      port: c.port,
      type: c.type,
      toolId: c.toolId,
    }))
  }

  private async getComponentAccess(componentId: string): Promise<{
    credential: CredentialRef | null;
    connectivity: ConnectivityRef | null;
    connectivityProvider: ConnectivityProviderRef | null;
  }> {
    const connectivity = await this.db.componentConnectivity.findUnique({
      where: { componentId },
    })

    // Resolve the component's credential (its "Connection"). Prefer the one
    // explicitly linked on the component (credentialId); fall back to the first
    // credential registered for the tool for components predating the link.
    // Secrets are encrypted at rest, so decrypt before handing to handlers.
    const component = await this.db.component.findUnique({ where: { id: componentId } })
    const rawCredential = component
      ? component.credentialId
        ? await this.db.credential.findUnique({ where: { id: component.credentialId } })
        : await this.db.credential.findFirst({
            where: { toolId: component.toolId, customerId: component.customerId },
          })
      : null
    const credential = rawCredential ? decryptCredentialSecrets(rawCredential) : null

    // Look up the customer's default connectivity provider
    let connectivityProviderRef: ConnectivityProviderRef | null = null
    if (component) {
      const provider = await this.db.connectivityProvider.findFirst({
        where: { customerId: component.customerId, isDefault: true, isEnabled: true },
      })
      if (provider) {
        // Decrypt sensitive config fields so pipeline handlers receive real credentials
        const rawConfig = (provider.config ?? {}) as Record<string, unknown>
        const { getAdapter } = await import('../../module/connectivity-provider/adapters')
        const { decryptFields } = await import('../../utils/encryption')
        const adapter = getAdapter(provider.providerType)
        const decryptedConfig = decryptFields(rawConfig, adapter.getSensitiveFields())

        connectivityProviderRef = {
          id: provider.id,
          providerType: provider.providerType,
          name: provider.name,
          status: provider.status,
          config: decryptedConfig,
        }
      }
    }

    return {
      credential: credential
        ? {
            id: credential.id,
            name: credential.name,
            username: credential.username,
            password: credential.password,
            apiToken: credential.apiToken,
            certificate: credential.certificate,
          }
        : null,
      connectivity: connectivity
        ? {
            id: connectivity.id,
            status: connectivity.status,
            sshCommand: connectivity.sshCommand,
            httpsUrl: connectivity.httpsUrl,
            tailscaleDeviceIP: connectivity.tailscaleDeviceIP,
          }
        : null,
      connectivityProvider: connectivityProviderRef,
    }
  }

  private async getCanvasSnapshot(canvasId: string, historyId: string): Promise<CanvasSnapshot> {
    const history = await this.db.configurationCanvasHistory.findUniqueOrThrow({
      where: { id: historyId },
    })

    const canvas = await this.db.configurationCanvas.findUniqueOrThrow({
      where: { id: canvasId },
      include: { sections: { include: { fields: true } } },
    })

    const items = toCanvasItems(canvas.sections)
    return {
      id: history.id,
      canvasId: canvas.id,
      version: history.version,
      name: canvas.name,
      toolType: canvas.toolType,
      entityType: canvas.entityType,
      items,
      sections: items,
      snapshot: history.snapshot as Record<string, unknown>,
    }
  }

  private async getPolicy(envId: string, customerId: string, appId: string) {
    const appPolicy = await this.db.environmentPolicy.findUnique({
      where: { tagId_customerId_appId: { tagId: envId, customerId, appId } },
    })
    if (appPolicy) return appPolicy

    // Fall back to the global policy. Global policies are stored with appId ''
    // (empty string) — the convention shared with the environment module — so a
    // policy created in the Environments UI still drives canary steps / strategy
    // / auto-rollback here.
    return this.db.environmentPolicy.findFirst({
      where: { tagId: envId, customerId, appId: '' },
    })
  }

  private async getPreviousConfig(deploymentId: string): Promise<CanvasSnapshot | null> {
    const deployment = await this.db.deployment.findUnique({
      where: { id: deploymentId },
      select: { previousDeploymentId: true },
    })
    if (!deployment?.previousDeploymentId) return null

    const previous = await this.db.deployment.findUnique({
      where: { id: deployment.previousDeploymentId },
      select: { canvasId: true, historyId: true },
    })
    if (!previous?.historyId) return null

    return this.getCanvasSnapshot(previous.canvasId, previous.historyId)
  }

  private async updateDeployment(id: string, data: Prisma.DeploymentUpdateInput) {
    await this.db.deployment.update({ where: { id }, data })
  }

  private async updateCanvas(id: string, status: string, lastDeployError?: string | null) {
    // `lastDeployError` is only touched when the caller passes it: a string sets
    // the failure reason (surfaced on the "Deploy failed" badge), null clears a
    // stale one on retry/success, and `undefined` leaves it untouched.
    const data: Prisma.ConfigurationCanvasUpdateInput = { status } as Prisma.ConfigurationCanvasUpdateInput
    if (lastDeployError !== undefined) {
      ;(data as { lastDeployError?: string | null }).lastDeployError = lastDeployError
    }
    await this.db.configurationCanvas.update({ where: { id }, data })
  }

  private async addLog(deploymentId: string, level: string, message: string, metadata?: unknown) {
    await this.db.deploymentLog.create({
      data: { deploymentId, level, message, metadata: metadata as Prisma.InputJsonValue },
    })
  }

  private async succeedDeployment(data: DeployJobData) {
    await this.updateDeployment(data.deploymentId, {
      status: 'SUCCEEDED',
      completedAt: new Date(),
    })
    await this.updateCanvas(data.canvasId, 'DEPLOYED', null)
    await this.addLog(data.deploymentId, 'info', 'Deployment completed successfully')
    // Central configuration history so the Version History panel shows "Deployed"
    // (the pipeline's per-canvas history is separate). Best-effort.
    await this.recordDeployHistory(data, 'deployed', 'Deployment completed successfully')
    // Change management: reflect the success onto any linked ticket (best-effort).
    await this.reflectTicket(data, { outcome: 'deploy_succeeded' })
  }

  /**
   * Reflect a deploy outcome onto the canvas's linked change tickets. Best-effort
   * and fully isolated — the ticketing service already swallows its own errors,
   * and this extra guard guarantees ticketing can NEVER fail a deploy.
   */
  private async reflectTicket(data: DeployJobData, transition: TicketStatusTransition): Promise<void> {
    try {
      await ticketingService.reflectDeployStatus(data.canvasId, data.customerId, transition)
    } catch {
      // ignore — ticketing must never affect the deploy lifecycle
    }
  }

  private async failDeployment(id: string, message: string) {
    await this.updateDeployment(id, { status: 'FAILED', completedAt: new Date() })
    await this.addLog(id, 'error', `Deployment failed: ${message}`)
  }

  /**
   * Write a central configuration-history entry for a deploy outcome so it shows
   * in the Version History / Reviews panel alongside validate/approve/edit. The
   * deploy path otherwise only writes the pipeline's per-canvas history table.
   * Best-effort — history logging must never fail a deploy.
   */
  private async recordDeployHistory(
    data: DeployJobData,
    deployState: 'deployed' | 'failed',
    message: string,
  ): Promise<void> {
    try {
      const canvas = await this.db.configurationCanvas.findUnique({
        where: { id: data.canvasId },
        select: { name: true },
      })
      await configurationHistoryService.createHistoryEntry({
        action: ConfigActionType.DEPLOYED,
        entityType: 'CONFIGURATION_CANVAS',
        entityId: data.canvasId,
        entityName: canvas?.name ?? 'Configuration',
        userId: data.triggeredById,
        customerId: data.customerId,
        deployState,
        details: { message },
      })
    } catch {
      // ignore — history logging must not affect the deploy lifecycle
    }
  }
}

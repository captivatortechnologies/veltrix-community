// ========================================================================
// Drift Detector
//
// Periodically checks if live configurations match what was deployed
// through the pipeline. Detects unauthorized manual changes.
// This is the enforcement mechanism for Security-as-Code.
// ========================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type { PipelineHandlers, DriftContext, ComponentRef } from './types'
import type { DriftDiff } from '../../../../shared/types/pipeline'
import { createPlatformDataApi } from './platform-data-api'
import { canvasItemsOf } from './canvasSnapshot'
import { effectiveDriftFrequency, isDue } from './drift-schedule'
import { decryptCredentialSecrets } from '../../module/credential/credential.service'
import { resolvePermissionSnapshotForUser, type PermissionSnapshot } from '../../lib/permissions'

/** Empty, non-privileged snapshot for the 'system' pseudo-user (no instance owner found for the tenant). */
const SYSTEM_PERMISSION_SNAPSHOT: PermissionSnapshot = {
  permissions: [],
  wildcards: { allAll: false, resources: [] },
  isPlatformAdmin: false,
}

/**
 * Pull the persisted canvas sections out of a deploy-time history snapshot. The
 * snapshot is `JSON.parse(JSON.stringify(canvas))` (see pipeline.service), so its
 * `sections[].fields[]` are the relational rows canvasItemsOf already flattens.
 * Returns undefined for a legacy snapshot with no sections so the caller can fall
 * back to the current canvas.
 */
export function snapshotSections(
  snapshot: unknown,
): Array<{ id?: string; name: string; fields?: unknown }> | undefined {
  const sections = (snapshot as { sections?: unknown } | null)?.sections
  return Array.isArray(sections) ? (sections as Array<{ id?: string; name: string; fields?: unknown }>) : undefined
}

export class DriftDetector {
  constructor(
    private db: PrismaClient,
    private getHandlers: (appId: string, configTypeId: string) => PipelineHandlers | null,
  ) {}

  /**
   * Run drift detection for all deployed configurations in an environment.
   * Called by a scheduled BullMQ job (e.g. hourly for prod, daily for staging).
   */
  async detectAll(customerId: string, environmentId: string): Promise<void> {
    // Find all SUCCEEDED deployments for this customer/environment
    const deployments = await this.db.deployment.findMany({
      where: {
        customerId,
        environmentId,
        status: 'SUCCEEDED',
      },
      orderBy: { completedAt: 'desc' },
      distinct: ['canvasId'], // Only latest deployment per canvas
      include: {
        canvas: { include: { sections: { include: { fields: true } } } },
      },
    })

    for (const deployment of deployments) {
      await this.detectForDeployment(deployment)
    }
  }

  /**
   * On-demand drift check for a SINGLE configuration (its latest SUCCEEDED
   * deployment). Powers the "Check drift now" button on a config; runs inline so
   * the caller can return fresh records immediately (no queue dependency).
   */
  async detectForCanvas(customerId: string, canvasId: string): Promise<void> {
    const deployment = await this.db.deployment.findFirst({
      where: { customerId, canvasId, status: 'SUCCEEDED' },
      orderBy: { completedAt: 'desc' },
      include: {
        canvas: { include: { sections: { include: { fields: true } } } },
      },
    })
    if (!deployment) return
    await this.detectForDeployment(deployment)
  }

  /**
   * On-demand check for ONE canvas that finalizes the async check state (run by
   * the `pipeline-drift-canvas` worker after the controller enqueues it): detect,
   * then mark the canvas IDLE and stamp lastDriftCheckAt — always, even if
   * detection found nothing or threw — so the client's poll ends cleanly.
   */
  async detectForCanvasAndFinalize(customerId: string, canvasId: string): Promise<void> {
    try {
      await this.detectForCanvas(customerId, canvasId)
    } finally {
      await this.db.configurationCanvas.updateMany({
        where: { id: canvasId, customerId },
        data: { driftCheckState: 'IDLE', lastDriftCheckAt: new Date() },
      })
    }
  }

  /**
   * On-demand drift check for ALL of a tenant's deployed configs across every
   * environment they've deployed to. Powers the Drift page's "Check drift now".
   */
  async detectForCustomer(customerId: string): Promise<void> {
    const envs = await this.db.deployment.findMany({
      where: { customerId, status: 'SUCCEEDED' },
      distinct: ['environmentId'],
      select: { environmentId: true },
    })
    for (const { environmentId } of envs) {
      await this.detectAll(customerId, environmentId)
    }
  }

  /**
   * Scheduled sweep across the whole platform: every tenant/environment pair that
   * has a SUCCEEDED deployment gets a detection run. Invoked by the recurring
   * `pipeline-drift-sweep` job (see drift.jobs.ts). Each pair is isolated so one
   * tenant's failure never aborts the sweep.
   */
  async sweepAll(): Promise<void> {
    // Frequency-aware: one row per deployed canvas; run only the configs that are
    // DUE per their effective schedule (per-app override → tenant default →
    // built-in), reusing lastDriftCheckAt as the clock. `off` skips entirely.
    const canvases = await this.db.deployment.findMany({
      where: { status: 'SUCCEEDED' },
      distinct: ['canvasId'],
      select: { customerId: true, canvasId: true, appId: true, canvas: { select: { lastDriftCheckAt: true } } },
    })
    const now = Date.now()
    const { loggerService } = await import('../../module/logger/logger.service')
    let ran = 0
    for (const c of canvases) {
      try {
        const frequency = await effectiveDriftFrequency(this.db, c.customerId, c.appId)
        if (!isDue(frequency, c.canvas?.lastDriftCheckAt ?? null, now)) continue
        await this.detectForCanvasAndFinalize(c.customerId, c.canvasId)
        ran++
      } catch (err) {
        loggerService.error(`Drift sweep failed for canvas ${c.canvasId}:`, err)
      }
    }
    loggerService.info(`[Drift] Sweep evaluated ${canvases.length} config(s), checked ${ran} due`)
  }

  /**
   * Run drift detection for a specific deployment.
   */
  async detectForDeployment(deployment: {
    appId: string
    customerId: string
    environmentId: string
    canvasId: string
    historyId: string
    triggeredById: string
    canvas: { entityType: string; name: string; toolType: string; sections: Array<{ name: string; fields: Array<{ key: string; value: unknown }> }> }
  }): Promise<void> {
    const handlers = this.getHandlers(deployment.appId, deployment.canvas.entityType)
    if (!handlers?.driftDetect) return

    const configType = await this.db.appConfigurationType.findFirst({
      where: { appId: deployment.appId, configTypeId: deployment.canvas.entityType },
    })

    const components = await this.db.component.findMany({
      where: {
        customerId: deployment.customerId,
        ...(configType?.componentTypes?.length
          ? { type: { hasSome: configType.componentTypes } }
          : {}),
      },
    })

    const env = await this.db.tag.findUniqueOrThrow({ where: { id: deployment.environmentId } })
    const user = await this.db.user.findFirst({ where: { customerId: deployment.customerId, isPlatformAdmin: true } })

    const snapshot = await this.db.configurationCanvasHistory.findUnique({
      where: { id: deployment.historyId },
    })

    if (!snapshot) return

    for (const component of components) {
      try {
        const connectivity = await this.db.componentConnectivity.findUnique({
          where: { componentId: component.id },
        })

        // Prefer the component's linked Connection (credentialId); fall back to
        // the tool's first credential. Secrets are encrypted at rest — decrypt
        // before handing to handlers.
        const rawCredential = component.credentialId
          ? await this.db.credential.findUnique({ where: { id: component.credentialId } })
          : await this.db.credential.findFirst({
              where: { toolId: component.toolId, customerId: component.customerId },
            })
        const credential = rawCredential ? decryptCredentialSecrets(rawCredential) : null

        // Resolve this server's connectivity provider — its explicit choice
        // (component.connectivityProviderId) first, else the tenant default —
        // mirroring deploy so drift is checked over the same path.
        const provider =
          (component.connectivityProviderId
            ? await this.db.connectivityProvider.findFirst({
                where: {
                  id: component.connectivityProviderId,
                  customerId: component.customerId,
                  isEnabled: true,
                },
              })
            : null) ??
          (await this.db.connectivityProvider.findFirst({
            where: { customerId: component.customerId, isDefault: true, isEnabled: true },
          }))

        // Drift detection runs as a scheduled job, not a live user action —
        // `user` is the tenant's first platform admin (found above) or
        // absent entirely. Resolve a real snapshot when we have a real
        // user; fall back to an empty, non-privileged snapshot otherwise
        // (apps must never treat drift-detect ctx.permissions as a bypass).
        const permissions = user
          ? await resolvePermissionSnapshotForUser(user.id)
          : SYSTEM_PERMISSION_SNAPSHOT

        const ctx: DriftContext = {
          appId: deployment.appId,
          customerId: deployment.customerId,
          configTypeId: deployment.canvas.entityType,
          canvas: {
            id: snapshot.id,
            canvasId: deployment.canvasId,
            version: snapshot.version,
            name: deployment.canvas.name,
            toolType: deployment.canvas.toolType,
            entityType: deployment.canvas.entityType,
            ...canvasItemsOf(deployment.canvas.sections),
            snapshot: snapshot.snapshot as Record<string, unknown>,
          },
          environment: { id: env.id, name: env.name },
          user: user ? { id: user.id, email: user.email, name: user.name } : { id: 'system', email: 'system', name: 'System' },
          settings: {},
          platform: createPlatformDataApi(this.db, deployment.customerId),
          permissions,
          component: {
            id: component.id,
            hostname: component.hostname,
            port: component.port,
            type: component.type,
            toolId: component.toolId,
          },
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
          connectivityProvider: provider
            ? await (async () => {
                const rawConfig = (provider.config ?? {}) as Record<string, unknown>
                const { getAdapter } = await import('../../module/connectivity-provider/adapters')
                const { decryptFields } = await import('../../utils/encryption')
                const adapter = getAdapter(provider.providerType)
                return {
                  id: provider.id,
                  providerType: provider.providerType,
                  name: provider.name,
                  status: provider.status,
                  config: decryptFields(rawConfig, adapter.getSensitiveFields()),
                }
              })()
            : null,
          deployedConfig: {
            id: snapshot.id,
            canvasId: deployment.canvasId,
            version: snapshot.version,
            name: deployment.canvas.name,
            toolType: deployment.canvas.toolType,
            entityType: deployment.canvas.entityType,
            // The DESIRED state is the frozen deploy-time snapshot (the canvas
            // serialized at deploy), NOT the live canvas — which may hold
            // undeployed edits. Reconstruct its items/sections so handlers, which
            // read deployedConfig.sections, see the approved spec. (Previously
            // hard-coded to [], so every drift check saw an empty desired spec and
            // reported no drift.) Fall back to the current canvas for any legacy
            // snapshot that predates section serialization.
            ...canvasItemsOf(snapshotSections(snapshot.snapshot) ?? deployment.canvas.sections),
            snapshot: snapshot.snapshot as Record<string, unknown>,
          },
        }

        const result = await handlers.driftDetect(ctx)

        if (result.hasDrift) {
          await this.recordDrift(deployment, component, result.diffs)
        } else {
          // Resolve any existing drift records for this component
          await this.db.driftRecord.updateMany({
            where: {
              appId: deployment.appId,
              configTypeId: deployment.canvas.entityType,
              environmentId: deployment.environmentId,
              customerId: deployment.customerId,
              componentId: component.id,
              isResolved: false,
            },
            data: { isResolved: true, resolvedAt: new Date(), resolvedAction: 'drift_cleared' },
          })
        }
      } catch (err) {
        // Log but don't fail the entire run — use dynamic import to avoid circular deps
        const { loggerService } = await import('../../module/logger/logger.service')
        loggerService.error(`Drift detection failed for component ${component.hostname}:`, err)
      }
    }
  }

  /**
   * Record a drift detection result
   */
  private async recordDrift(
    deployment: any,
    component: { id: string; hostname: string },
    diffs: DriftDiff[],
  ): Promise<void> {
    // Determine max severity
    const severity = diffs.some((d) => d.severity === 'critical')
      ? 'critical'
      : diffs.some((d) => d.severity === 'warning')
        ? 'warning'
        : 'info'

    // Check if there's already an unresolved drift for this component
    const existing = await this.db.driftRecord.findFirst({
      where: {
        appId: deployment.appId,
        configTypeId: deployment.canvas.entityType,
        environmentId: deployment.environmentId,
        customerId: deployment.customerId,
        componentId: component.id,
        isResolved: false,
      },
    })

    if (existing) {
      // Update existing drift record with latest diffs
      await this.db.driftRecord.update({
        where: { id: existing.id },
        data: { diffs: diffs as unknown as Prisma.InputJsonValue, severity, detectedAt: new Date() },
      })
    } else {
      // Create new drift record
      await this.db.driftRecord.create({
        data: {
          appId: deployment.appId,
          configTypeId: deployment.canvas.entityType,
          environmentId: deployment.environmentId,
          customerId: deployment.customerId,
          componentId: component.id,
          severity,
          diffs: diffs as unknown as Prisma.InputJsonValue,
        },
      })
    }

    // Create a platform alert for critical drift
    if (severity === 'critical') {
      await this.db.platformAlert.create({
        data: {
          severity: 'critical',
          category: 'security',
          title: `Configuration drift detected on ${component.hostname}`,
          message: `${diffs.length} unauthorized change(s) detected outside the Security-as-Code pipeline`,
          details: { appId: deployment.appId, componentId: component.id, diffs } as unknown as Prisma.InputJsonValue,
          customerId: deployment.customerId,
        },
      })
    }
  }
}

// ========================================================================
// Sandbox Run Service
//
// Executes ONE synced pipeline handler inside the isolated child-process
// runner (POST /api/sandboxes/:id/run). This is where the sandbox-safe
// PipelineContext is assembled — everything the child receives is decided
// here, parent-side, and serialized as plain JSON.
//
// What sandbox handlers CAN access:
//   - canvas: the draft canvas content the caller sent with the request
//     (id/canvasId are synthetic "sandbox-<id>" values, version 0)
//   - environment: always {id:'sandbox', name:'sandbox'}
//   - user: the calling portal user, or a synthetic CLI principal for
//     API-key callers
//   - settings: the manifest's declared setting DEFAULTS (no tenant
//     overrides — sandbox apps are not installed)
//   - ctx.platform: a STATIC snapshot resolved before the spawn —
//     latestDeployment is always null and listComponents() only ever sees
//     components the tenant explicitly tagged "sandbox" (see runner-ipc.ts
//     for the design note). No live data API crosses the process boundary.
//   - component/connectivity (healthCheck/driftDetect only): a component
//     explicitly tagged "sandbox" and its own connectivity record
//   - credential: ONLY a credential that is itself tagged "sandbox" and
//     matches the target component's tool — production credentials are
//     unreachable by construction
//
// What sandbox handlers can NEVER access:
//   - deploy/rollback execution (they mutate external systems; excluded
//     from RUNNABLE_SANDBOX_HANDLERS)
//   - connectivityProvider: always null in v1 — provider configs hold
//     tenant-wide secrets (Tailscale/WireGuard API keys) that must not
//     reach tenant-supplied code
//   - platform env vars, the database, Redis, or any other server state
//     (enforced by the runner's env scrubbing + process boundary)
//
// driftDetect note: ctx.deployedConfig is set to the SAME canvas snapshot
// the caller sent — sandbox canvases have no deployment history, so drift
// runs compare "what I just wrote" against whatever live state the handler
// fetches from the sandbox-tagged component.
// ========================================================================

import * as crypto from 'crypto'
import type { Sandbox } from '@prisma/client'
import prisma from '../../db'
import type { AppManifest } from '../../../../shared/types/app'
import { loggerService } from '../logger/logger.service'
import { getSandboxConfig, getSandboxDir } from './sandbox.config'
import { toCanvasItems } from '../../core/pipeline-engine/canvasSnapshot'
import { decryptCredentialSecrets } from '../credential/credential.service'
import { sandboxRegistry, type RegisteredSandboxApp, type SandboxConfigTypeEntry } from './sandbox-registry'
import {
  invokeSandboxHandler,
  tryAcquireRunnerSlot,
  releaseRunnerSlot,
} from './runner/runner-invoker'
import type { RunnerLogLine, RunnerPlatformSnapshot } from './runner/runner-ipc'
import { SandboxError } from './sandbox.service'
import { sandboxEvents } from './sandbox.events'
import { writeSandboxAudit } from './sandbox.audit'
import {
  RUNNABLE_SANDBOX_HANDLERS,
  type RunSandboxRequest,
  type RunSandboxResponse,
  type RunnableSandboxHandler,
} from './sandbox.schemas'

/** Tag name an admin puts on dev/mock components (and credentials) to opt them into sandbox runs. */
export const SANDBOX_TAG_NAME = 'sandbox'

const SANDBOX_ENVIRONMENT = { id: 'sandbox', name: 'sandbox' } as const

/** How many log lines accumulate before a sandbox:log WS batch is flushed. */
const LOG_BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// Context assembly helpers
// ---------------------------------------------------------------------------

interface SandboxComponentRef {
  id: string
  hostname: string
  port: string
  type: string[]
  toolId: string
}

async function getSandboxTaggedComponents(
  customerId: string,
  componentTypes: string[],
): Promise<SandboxComponentRef[]> {
  return prisma.component.findMany({
    where: {
      customerId,
      tags: { some: { tag: { name: SANDBOX_TAG_NAME, customerId } } },
      ...(componentTypes.length ? { type: { hasSome: componentTypes } } : {}),
    },
    select: { id: true, hostname: true, port: true, type: true, toolId: true },
  })
}

/**
 * Resolve a credential for the target component — but ONLY one the tenant
 * explicitly tagged "sandbox". Untagged (production) credentials can never
 * be selected because the tag filter is part of the query itself.
 */
async function getSandboxTaggedCredential(customerId: string, toolId: string) {
  const rawCredential = await prisma.credential.findFirst({
    where: {
      customerId,
      toolId,
      tags: { some: { tag: { name: SANDBOX_TAG_NAME, customerId } } },
    },
  })
  if (!rawCredential) return null
  // Secrets are encrypted at rest — decrypt before handing to the sandbox handler.
  const credential = decryptCredentialSecrets(rawCredential)
  return {
    id: credential.id,
    name: credential.name,
    username: credential.username,
    password: credential.password,
    apiToken: credential.apiToken,
    certificate: credential.certificate,
  }
}

async function getComponentConnectivity(componentId: string) {
  const connectivity = await prisma.componentConnectivity.findUnique({
    where: { componentId },
  })
  if (!connectivity) return null
  return {
    id: connectivity.id,
    status: connectivity.status,
    sshCommand: connectivity.sshCommand,
    httpsUrl: connectivity.httpsUrl,
    tailscaleDeviceIP: connectivity.tailscaleDeviceIP,
  }
}

async function resolveRunUser(actorUserId: string | null) {
  if (actorUserId) {
    const user = await prisma.user.findUnique({ where: { id: actorUserId } })
    if (user) return { id: user.id, email: user.email, name: user.name }
  }
  // API-key (CLI) callers have no User row; hand handlers a stable synthetic ref.
  return { id: 'sandbox-cli', email: 'cli@sandbox.local', name: 'Veltrix CLI' }
}

function buildSettingsFromManifest(manifest: AppManifest): Record<string, unknown> {
  const settings: Record<string, unknown> = {}
  for (const setting of manifest.settings || []) {
    if (setting.default !== undefined) settings[setting.key] = setting.default
  }
  return settings
}

function buildSandboxCanvasSnapshot(
  sandbox: Sandbox,
  configTypeId: string,
  canvas: RunSandboxRequest['canvas'],
) {
  const items = toCanvasItems(canvas?.sections)
  return {
    id: `sandbox-${sandbox.id}`,
    canvasId: `sandbox-${sandbox.id}`,
    version: 0,
    name: canvas?.name || `${sandbox.name} (sandbox)`,
    toolType: sandbox.appId,
    entityType: configTypeId,
    items,
    sections: items,
    snapshot: {},
  }
}

function createLogBatcher(flushFn: (lines: RunnerLogLine[]) => void) {
  let buffer: RunnerLogLine[] = []
  return {
    push(line: RunnerLogLine): void {
      buffer.push(line)
      if (buffer.length >= LOG_BATCH_SIZE) this.flush()
    },
    flush(): void {
      if (buffer.length === 0) return
      const batch = buffer
      buffer = []
      flushFn(batch)
    },
  }
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

function assertRunnable(sandbox: Sandbox): void {
  switch (sandbox.status) {
    case 'ACTIVE':
      return
    case 'EXPIRED':
      throw new SandboxError('Sandbox has expired; create a new one to continue', 410)
    case 'SYNCING':
      throw new SandboxError('A sync is in progress; retry once it completes', 409)
    case 'ERROR':
      throw new SandboxError(
        'The last sync failed validation — fix the reported errors and resync before running handlers',
        409,
      )
    default:
      throw new SandboxError(`Sandbox is not runnable in status ${sandbox.status}`, 409)
  }
}

function resolveRegistryEntry(sandbox: Sandbox): RegisteredSandboxApp {
  try {
    return sandboxRegistry.ensureLoaded(sandbox.customerId, sandbox.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new SandboxError(
      `Sandbox has no runnable app (sync a valid app first): ${message}`,
      409,
    )
  }
}

function resolveHandlerArtifact(
  configType: SandboxConfigTypeEntry,
  handler: RunnableSandboxHandler,
): string {
  const artifact = configType.handlerArtifacts[handler]
  if (!artifact) {
    const declaredButMissing = configType.missingHandlers.includes(handler)
    throw new SandboxError(
      declaredButMissing
        ? `Handler "${handler}" is declared in the manifest but its transpiled artifact is missing — resync the sandbox`
        : `Handler "${handler}" is not declared for configuration type "${configType.configTypeId}"`,
      400,
    )
  }
  return artifact
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const runService = {
  async runHandler(
    sandbox: Sandbox,
    body: RunSandboxRequest,
    actorUserId: string | null,
  ): Promise<RunSandboxResponse> {
    const { runnerConcurrency } = getSandboxConfig()
    const handler = body.handler

    // Route schema already enforces the enum; re-check for non-HTTP callers.
    if (!RUNNABLE_SANDBOX_HANDLERS.includes(handler)) {
      throw new SandboxError(
        `Handler "${handler}" cannot be run in a sandbox (deploy/rollback mutate external systems and are not exposed in v1)`,
        400,
      )
    }

    assertRunnable(sandbox)

    const app = resolveRegistryEntry(sandbox)
    const configType = app.configTypes.get(body.configTypeId)
    if (!configType) {
      throw new SandboxError(
        `Configuration type "${body.configTypeId}" is not defined by the synced manifest`,
        404,
      )
    }
    const handlerPath = resolveHandlerArtifact(configType, handler)

    // --- Target + access resolution (all queries are tag-restricted) ---
    const sandboxComponents = await getSandboxTaggedComponents(
      sandbox.customerId,
      configType.componentTypes,
    )

    const needsComponent = handler === 'healthCheck' || handler === 'driftDetect'
    let component: SandboxComponentRef | null = null
    let credential: Awaited<ReturnType<typeof getSandboxTaggedCredential>> = null
    let connectivity: Awaited<ReturnType<typeof getComponentConnectivity>> = null

    if (needsComponent) {
      if (body.componentId) {
        component = sandboxComponents.find((c) => c.id === body.componentId) ?? null
        if (!component) {
          throw new SandboxError(
            `Component ${body.componentId} is not available to sandbox runs — only components tagged "${SANDBOX_TAG_NAME}" (matching this configuration type) can be targeted`,
            403,
          )
        }
      } else {
        component = sandboxComponents[0] ?? null
        if (!component) {
          throw new SandboxError(
            `"${handler}" needs a target component. Tag a dev/mock component "${SANDBOX_TAG_NAME}" to make it available to sandbox runs`,
            400,
          )
        }
      }
      credential = await getSandboxTaggedCredential(sandbox.customerId, component.toolId)
      connectivity = await getComponentConnectivity(component.id)
    }

    // --- Concurrency gate ---
    if (!tryAcquireRunnerSlot(sandbox.customerId, runnerConcurrency)) {
      throw new SandboxError(
        `Sandbox runner concurrency limit reached (${runnerConcurrency} concurrent run(s) per tenant); retry shortly`,
        429,
      )
    }

    const runId = crypto.randomUUID()
    try {
      const canvasSnapshot = buildSandboxCanvasSnapshot(sandbox, body.configTypeId, body.canvas)
      const user = await resolveRunUser(actorUserId)

      const baseCtx: Record<string, unknown> = {
        appId: sandbox.appId,
        customerId: sandbox.customerId,
        configTypeId: body.configTypeId,
        canvas: canvasSnapshot,
        environment: SANDBOX_ENVIRONMENT,
        user,
        settings: buildSettingsFromManifest(app.manifest),
        // Marks the run sandbox:true end-to-end (plan §2C); handlers typed
        // against PipelineContext simply ignore the extra field.
        sandbox: true,
      }
      if (needsComponent) {
        baseCtx.component = component
        baseCtx.credential = credential
        baseCtx.connectivity = connectivity
        baseCtx.connectivityProvider = null // never provider configs — see header
      }
      if (handler === 'driftDetect') {
        baseCtx.deployedConfig = canvasSnapshot
      }

      // Guarantee a plain JSON payload (drops undefined, Dates -> strings,
      // and would throw loudly if anything non-serializable slipped in).
      const ctx = JSON.parse(JSON.stringify(baseCtx)) as Record<string, unknown>

      const platformData: RunnerPlatformSnapshot = {
        latestDeployment: null, // sandbox canvases have no deployment history
        components: sandboxComponents,
      }

      const logBatcher = createLogBatcher((lines) =>
        sandboxEvents.emitLog(sandbox.customerId, { sandboxId: sandbox.id, runId, lines }),
      )

      const outcome = await invokeSandboxHandler({
        handlerPath,
        handlerName: handler,
        ctx,
        platformData,
        cwd: getSandboxDir(sandbox.customerId, sandbox.id),
        onLog: (line) => logBatcher.push(line),
      })
      logBatcher.flush()

      sandboxEvents.emitRunResult(sandbox.customerId, {
        sandboxId: sandbox.id,
        runId,
        handler,
        configTypeId: body.configTypeId,
        ok: outcome.ok,
        error: outcome.error,
        timedOut: outcome.timedOut,
        durationMs: outcome.durationMs,
      })

      await writeSandboxAudit({
        action: 'sandbox.run',
        actorUserId,
        createdById: sandbox.createdById,
        customerId: sandbox.customerId,
        sandboxId: sandbox.id,
        details: {
          runId,
          handler,
          configTypeId: body.configTypeId,
          ok: outcome.ok,
          timedOut: outcome.timedOut,
          durationMs: outcome.durationMs,
          componentId: component?.id ?? null,
        },
        result: outcome.ok ? 'SUCCESS' : 'FAILURE',
        errorMessage: outcome.error ?? undefined,
      })

      loggerService.info(
        `Sandbox run ${runId} (${sandbox.id}/${body.configTypeId}/${handler}): ` +
          `ok=${outcome.ok} timedOut=${outcome.timedOut} durationMs=${outcome.durationMs}`,
      )

      return {
        runId,
        handler,
        configTypeId: body.configTypeId,
        ok: outcome.ok,
        result: outcome.result,
        error: outcome.error,
        timedOut: outcome.timedOut,
        durationMs: outcome.durationMs,
        logs: outcome.logs,
      }
    } finally {
      releaseRunnerSlot(sandbox.customerId)
    }
  },
}

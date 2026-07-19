// ========================================================================
// Platform Bootstrap
//
// Initializes all core platform services on startup:
// AppRegistry, JobRunner, PipelineService, DriftDetector
//
// This is the single place where all core services are wired together.
// ========================================================================

import * as path from 'path'
import type { FastifyInstance } from 'fastify'
import prisma from '../db'
import { AppRegistry } from './app-engine/app-registry'
import { registerAppRoutes } from './app-engine/app-route-registrar'
import { JobRunner } from './job-runner'
import { PipelineService } from './pipeline-engine/pipeline.service'
import { DeploymentOrchestrator } from './pipeline-engine/deployment.orchestrator'
import { DriftDetector } from './pipeline-engine/drift-detector'
import { loggerService } from '../module/logger/logger.service'
import { isFeatureEnabled } from '../config/feature-flags'
import { registerSandboxCleanupJob } from '../module/sandbox/sandbox.jobs'

// --- Singleton instances ---

let appRegistry: AppRegistry | null = null
let jobRunner: JobRunner | null = null
let pipelineService: PipelineService | null = null
let deploymentOrchestrator: DeploymentOrchestrator | null = null
let driftDetector: DriftDetector | null = null
let initialized = false

// --- Public accessors ---

export function getAppRegistry(): AppRegistry {
  if (!appRegistry) throw new Error('Platform not initialized. Call initializePlatform() first.')
  return appRegistry
}

export function getJobRunner(): JobRunner {
  if (!jobRunner) throw new Error('Platform not initialized. Call initializePlatform() first.')
  return jobRunner
}

export function getPipelineService(): PipelineService {
  if (!pipelineService) throw new Error('Platform not initialized. Call initializePlatform() first.')
  return pipelineService
}

export function getDriftDetector(): DriftDetector {
  if (!driftDetector) throw new Error('Platform not initialized. Call initializePlatform() first.')
  return driftDetector
}

// --- Initialization ---

/**
 * Startup must never block indefinitely on an external service. Bounds a boot
 * step so an unreachable-but-accepting dependency (classically Redis behind a
 * dead port-forward) surfaces as a warning instead of an unbootable server.
 * The underlying operation is left to settle on its own; we only stop waiting.
 */
const BOOT_STEP_TIMEOUT_MS = 15_000

function withBootTimeout<T>(operation: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${what} timed out after ${BOOT_STEP_TIMEOUT_MS}ms — is Redis reachable?`)),
        BOOT_STEP_TIMEOUT_MS,
      )
      // Never hold the event loop open on account of this guard.
      timer.unref()
    }),
  ])
}

export async function initializePlatform(): Promise<void> {
  if (initialized) return

  // Where app packages are discovered from. Defaults to the installed-apps
  // directory; point APPS_DIR at a checkout of the community apps repo
  // (e.g. APPS_DIR=../../veltrix-apps/apps) for local app development.
  // See VELTRIX_APPS_REPO in marketplace-catalog.ts for the configurable
  // GitHub repo the marketplace catalog pulls installable packages from.
  // NOTE: resolved from process.cwd() (the server package root in every
  // entrypoint — `pnpm --filter ./server dev|start`, `node dist/...`, and
  // the Docker image's WORKDIR all launch with cwd = the server package
  // dir), not __dirname. __dirname's depth relative to the package root
  // differs between `ts-node src/server.ts` (unaffected by tsconfig) and
  // the compiled dist output (whose depth follows tsconfig.json's rootDir,
  // now the monorepo root — see the TS6059/rootDir cleanup note there), so
  // an __dirname-relative default would silently point at two different
  // locations depending on how the process was started.
  const appsDir = process.env.APPS_DIR
    ? path.resolve(process.cwd(), process.env.APPS_DIR)
    : path.resolve(process.cwd(), 'apps')
  loggerService.info(`[Platform] Apps directory: ${appsDir}`)

  // 1. Create AppRegistry
  appRegistry = new AppRegistry(prisma, appsDir)

  // 2. Handler resolver - connects pipeline engine to app registry
  const getHandlers = (appId: string, configTypeId: string) => {
    return appRegistry!.getPipelineHandlers(appId, configTypeId)
  }

  // 3. Create DriftDetector
  driftDetector = new DriftDetector(prisma, getHandlers)

  // 4. Enqueue function (lazy — jobRunner assigned after creation)
  const enqueueJob = async (queue: string, data: unknown): Promise<void> => {
    await jobRunner!.enqueue(queue, data)
  }

  // 5. Create DeploymentOrchestrator
  deploymentOrchestrator = new DeploymentOrchestrator(prisma, getHandlers, enqueueJob)

  // 6. Create JobRunner (BullMQ)
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  jobRunner = new JobRunner({
    redisUrl,
    db: prisma,
    deploymentOrchestrator,
    driftDetector,
  })

  // 7. Create PipelineService with real dependencies
  pipelineService = new PipelineService(prisma, getHandlers, enqueueJob)

  // 8. Initialize AppRegistry (discover and load built-in apps)
  try {
    await appRegistry.initialize()
    loggerService.info('[Platform] AppRegistry initialized')
  } catch (err) {
    loggerService.warn('[Platform] AppRegistry initialization skipped (no apps found or error):', err)
  }

  // 9. Initialize JobRunner (start workers)
  //
  // Every await here is bounded. Redis can be unreachable in a way that never
  // errors — a socket that accepts but never answers (a stale port-forward, a
  // half-open relay) — and BullMQ then retries forever, so the await never
  // settles. A try/catch cannot catch a hang: the platform would sit here
  // silently, never binding its port and never logging why. Bounding the wait
  // turns that into the "skipped" warning this code already intends to emit.
  try {
    await withBootTimeout(jobRunner.initialize(), 'JobRunner initialization')
    loggerService.info('[Platform] JobRunner initialized')

    // 9b. Sandbox TTL cleanup (only when the sandbox feature is enabled). The
    // only background job the community edition registers here — the hosted
    // platform-metrics-aggregation / BYOL-usage-reporting / billing-
    // enforcement jobs are commercial-tier concerns and do not exist in this
    // edition (see the excluded module/subscription, module/platform-admin).
    if (isFeatureEnabled('platform.sandbox')) {
      try {
        await withBootTimeout(registerSandboxCleanupJob(jobRunner), 'Sandbox cleanup job registration')
      } catch (err) {
        loggerService.warn('[Platform] Sandbox cleanup job registration skipped:', err)
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : JSON.stringify(err)
    loggerService.warn(`[Platform] JobRunner initialization skipped (Redis may not be available): ${errMsg}`)
  }

  initialized = true
  loggerService.info('[Platform] Core services initialized')
}

/**
 * Register all loaded apps' routes with the Fastify server.
 * Call this after initializePlatform() and before server.listen().
 */
export async function registerAppRoutesWithServer(fastify: FastifyInstance): Promise<void> {
  if (!appRegistry) return

  const loadedApps = appRegistry.getAllLoadedApps()

  for (const app of loadedApps) {
    if (app.serverModule) {
      try {
        await registerAppRoutes(fastify, app.manifest, app.dir, app.serverModule)
      } catch (err) {
        loggerService.error(`[Platform] Failed to register routes for app "${app.manifest.id}":`, err)
      }
    }
  }
}

export async function shutdownPlatform(): Promise<void> {
  if (jobRunner) {
    await jobRunner.shutdown()
  }
  initialized = false
  loggerService.info('[Platform] Shutdown complete')
}

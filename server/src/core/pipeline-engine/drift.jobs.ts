// ========================================================================
// Configuration Drift — scheduled sweep job
//
// Registers the recurring BullMQ job that periodically checks every deployed
// configuration for drift (manual changes made outside the Veltrix pipeline).
// Wired from platform-bootstrap.ts after the JobRunner starts, mirroring the
// metrics / sandbox / billing job registrations: the call site wraps this in a
// try/catch so a missing/down Redis fails soft (server still boots).
// ========================================================================

import type { JobRunner } from '../job-runner'
import type { DriftDetector } from './drift-detector'
import { loggerService } from '../../module/logger/logger.service'

export const DRIFT_SWEEP_QUEUE = 'pipeline-drift-sweep'
export const DRIFT_SWEEP_JOB_ID = 'pipeline-drift-sweep-recurring'
/** One-off on-demand checks for a single canvas ("Check drift now"), run async. */
export const DRIFT_CANVAS_QUEUE = 'pipeline-drift-canvas'
// Hourly by default — override per environment (e.g. daily for staging).
const DRIFT_SWEEP_CRON = process.env.DRIFT_SWEEP_CRON || '0 * * * *'

export async function registerDriftSweepJob(
  jobRunner: JobRunner,
  driftDetector: DriftDetector,
): Promise<void> {
  jobRunner.registerQueueWorker(DRIFT_SWEEP_QUEUE, async () => {
    await driftDetector.sweepAll()
    loggerService.info('[Drift] Scheduled sweep completed')
  })

  await jobRunner.scheduleRecurring(DRIFT_SWEEP_QUEUE, DRIFT_SWEEP_JOB_ID, {}, DRIFT_SWEEP_CRON)
  loggerService.info(`[Drift] Sweep scheduled (cron: ${DRIFT_SWEEP_CRON})`)
}

/**
 * Worker for on-demand "Check drift now": the controller enqueues one job per
 * canvas and returns immediately, so a slow managed-ZTNA check (SSH file hashing
 * + audit searches) never blocks the request. The worker finalizes the canvas's
 * drift-check state so the client's poll ends.
 */
export async function registerDriftCanvasJob(
  jobRunner: JobRunner,
  driftDetector: DriftDetector,
): Promise<void> {
  jobRunner.registerQueueWorker(DRIFT_CANVAS_QUEUE, async (job) => {
    const data = (job.data ?? {}) as { customerId?: string; canvasId?: string }
    if (!data.customerId || !data.canvasId) return
    await driftDetector.detectForCanvasAndFinalize(data.customerId, data.canvasId)
    loggerService.info(`[Drift] On-demand check completed for canvas ${data.canvasId}`)
  })
  loggerService.info('[Drift] On-demand canvas-check worker registered')
}

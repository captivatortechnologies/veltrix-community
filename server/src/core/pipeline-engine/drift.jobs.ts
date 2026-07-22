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

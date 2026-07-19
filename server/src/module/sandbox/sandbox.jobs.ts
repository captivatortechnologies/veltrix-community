// ========================================================================
// Sandbox Jobs
//
// Registers the repeatable BullMQ TTL cleanup job that marks past-expiry
// sandboxes EXPIRED and removes their directories. Wired from
// platform-bootstrap after the JobRunner starts (and only when the
// SANDBOX_ENABLED feature flag is on).
// ========================================================================

import type { JobRunner } from '../../core/job-runner'
import { loggerService } from '../logger/logger.service'
import { getSandboxConfig } from './sandbox.config'
import { sandboxService } from './sandbox.service'

export const SANDBOX_CLEANUP_QUEUE = 'sandbox-cleanup'
export const SANDBOX_CLEANUP_JOB_ID = 'sandbox-ttl-cleanup'

export async function registerSandboxCleanupJob(jobRunner: JobRunner): Promise<void> {
  jobRunner.registerQueueWorker(SANDBOX_CLEANUP_QUEUE, async () => {
    const expiredCount = await sandboxService.processExpiredSandboxes()
    if (expiredCount > 0) {
      loggerService.info(`[SandboxCleanup] Expired ${expiredCount} sandbox(es)`)
    }
  })

  const { cleanupCron } = getSandboxConfig()
  await jobRunner.scheduleRecurring(SANDBOX_CLEANUP_QUEUE, SANDBOX_CLEANUP_JOB_ID, {}, cleanupCron)

  loggerService.info(`[SandboxCleanup] TTL cleanup scheduled (cron: ${cleanupCron})`)
}

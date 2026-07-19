// ========================================================================
// Job Runner (BullMQ)
//
// Redis-based job queue that replaces RabbitMQ.
// Handles pipeline deployment jobs, drift detection schedules,
// and any background work apps need.
// ========================================================================

import { Queue, Worker, type Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { DeploymentOrchestrator } from '../pipeline-engine/deployment.orchestrator'
import type { DriftDetector } from '../pipeline-engine/drift-detector'
import type {
  DeployJobData,
  RollbackJobData,
  DriftDetectJobData,
} from '../pipeline-engine/types'

export interface JobRunnerConfig {
  redisUrl: string
  db: PrismaClient
  deploymentOrchestrator: DeploymentOrchestrator
  driftDetector: DriftDetector
}

export class JobRunner {
  private queues = new Map<string, Queue>()
  private workers = new Map<string, Worker>()
  private redisConnection: { host: string; port: number }

  constructor(private config: JobRunnerConfig) {
    const url = new URL(config.redisUrl)
    this.redisConnection = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
    }
  }

  /**
   * Initialize all queues and workers.
   */
  async initialize(): Promise<void> {
    // Pipeline deployment queue
    this.createQueue('pipeline-deploy')
    this.createWorker('pipeline-deploy', async (job: Job<DeployJobData>) => {
      await this.config.deploymentOrchestrator.executeDeployment(job.data)
    })

    // Pipeline rollback queue
    this.createQueue('pipeline-rollback')
    this.createWorker('pipeline-rollback', async (job: Job<RollbackJobData>) => {
      await this.config.deploymentOrchestrator.executeRollback(job.data)
    })

    // Drift detection queue
    this.createQueue('pipeline-drift-detect')
    this.createWorker('pipeline-drift-detect', async (job: Job<DriftDetectJobData>) => {
      await this.config.driftDetector.detectAll(job.data.customerId, job.data.environmentId)
    })

    // Generic app job queue (apps can enqueue custom work)
    this.createQueue('app-jobs')

    console.log('[JobRunner] Initialized with queues: pipeline-deploy, pipeline-rollback, pipeline-drift-detect, app-jobs')
  }

  /**
   * Enqueue a job.
   */
  async enqueue(queueName: string, data: unknown, options?: { delay?: number; priority?: number }): Promise<string> {
    const queue = this.queues.get(queueName)
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`)
    }

    const job = await queue.add(queueName, data, {
      delay: options?.delay,
      priority: options?.priority,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    })

    return job.id || ''
  }

  /**
   * Schedule a recurring job (for drift detection).
   */
  async scheduleRecurring(
    queueName: string,
    jobId: string,
    data: unknown,
    cronExpression: string,
  ): Promise<void> {
    const queue = this.queues.get(queueName)
    if (!queue) {
      throw new Error(`Queue "${queueName}" not found`)
    }

    await queue.upsertJobScheduler(
      jobId,
      { pattern: cronExpression },
      { name: jobId, data: data as any },
    )
  }

  /**
   * Register a custom worker for an app queue.
   */
  registerAppWorker(appId: string, handler: (job: Job) => Promise<void>): void {
    const queueName = `app-${appId}`
    this.createQueue(queueName)
    this.createWorker(queueName, handler)
  }

  /**
   * Register a queue + worker for a platform feature (e.g. sandbox TTL
   * cleanup). Unlike registerAppWorker, the queue name is used verbatim.
   */
  registerQueueWorker(queueName: string, handler: (job: Job) => Promise<void>): void {
    if (this.queues.has(queueName)) return
    this.createQueue(queueName)
    this.createWorker(queueName, handler)
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    const closePromises: Promise<void>[] = []

    for (const [name, worker] of this.workers) {
      closePromises.push(worker.close())
    }
    for (const [name, queue] of this.queues) {
      closePromises.push(queue.close())
    }

    await Promise.all(closePromises)
    console.log('[JobRunner] Shut down')
  }

  private createQueue(name: string): Queue {
    const queue = new Queue(name, { connection: this.redisConnection })
    this.queues.set(name, queue)
    return queue
  }

  private createWorker(name: string, processor: (job: Job) => Promise<void>): Worker {
    const worker = new Worker(name, processor, {
      connection: this.redisConnection,
      concurrency: 5,
    })

    worker.on('failed', (job, err) => {
      console.error(`[JobRunner] Job failed in ${name}:`, job?.id, err.message)
    })

    worker.on('completed', (job) => {
      console.log(`[JobRunner] Job completed in ${name}:`, job.id)
    })

    this.workers.set(name, worker)
    return worker
  }
}

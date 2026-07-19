// ========================================================================
// Sandbox Configuration
//
// All limits are environment-driven so SaaS operators can tune them per
// deployment (Helm values / Docker env) without code changes. Values are
// read on every call (not cached) so tests and dynamic reconfiguration
// behave predictably.
// ========================================================================

import * as path from 'path'

export interface SandboxConfig {
  /** Max sandboxes per tenant (SANDBOX_QUOTA, default 2). */
  quota: number
  /** Idle TTL in days; renewed on every successful sync (SANDBOX_TTL_DAYS, default 7). */
  ttlDays: number
  /** Max total uncompressed bytes per sandbox (SANDBOX_MAX_BYTES, default 20 MB). */
  maxBytes: number
  /** Max number of files per sandbox (SANDBOX_MAX_FILES, default 500). */
  maxFiles: number
  /** Root directory for sandbox file storage (SANDBOX_DIR). */
  rootDir: string
  /** Cron pattern for the TTL cleanup job (SANDBOX_CLEANUP_CRON, default every 15 min). */
  cleanupCron: string
  /** Hard wall-clock timeout for one sandbox runner invocation in ms (SANDBOX_RUNNER_TIMEOUT_MS, default 30 s). */
  runnerTimeoutMs: number
  /** Max concurrent runner child processes per customer (SANDBOX_RUNNER_CONCURRENCY, default 2). */
  runnerConcurrency: number
  /** V8 old-space heap cap for the runner child process in MB (SANDBOX_RUNNER_MAX_OLD_SPACE_MB, default 256). */
  runnerMaxOldSpaceMb: number
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed
}

export function getSandboxConfig(): SandboxConfig {
  return {
    quota: envInt('SANDBOX_QUOTA', 2),
    ttlDays: envInt('SANDBOX_TTL_DAYS', 7),
    maxBytes: envInt('SANDBOX_MAX_BYTES', 20 * 1024 * 1024),
    maxFiles: envInt('SANDBOX_MAX_FILES', 500),
    rootDir: process.env.SANDBOX_DIR
      ? path.resolve(process.env.SANDBOX_DIR)
      : path.resolve('data/sandboxes'),
    cleanupCron: process.env.SANDBOX_CLEANUP_CRON || '*/15 * * * *',
    runnerTimeoutMs: envInt('SANDBOX_RUNNER_TIMEOUT_MS', 30000),
    runnerConcurrency: envInt('SANDBOX_RUNNER_CONCURRENCY', 2),
    runnerMaxOldSpaceMb: envInt('SANDBOX_RUNNER_MAX_OLD_SPACE_MB', 256),
  }
}

/**
 * Absolute path of a sandbox's file storage directory.
 * Both segments are server-generated UUIDs (never user input), so they are
 * safe to join; we still resolve + verify containment as defence in depth.
 */
export function getSandboxDir(customerId: string, sandboxId: string): string {
  const root = getSandboxConfig().rootDir
  const dir = path.resolve(root, customerId, sandboxId)
  if (!dir.startsWith(root + path.sep)) {
    throw new Error('Sandbox directory resolution escaped the sandbox root')
  }
  return dir
}

/** Compute the expiry timestamp for a sandbox created/synced "now". */
export function computeExpiresAt(from: Date = new Date()): Date {
  const { ttlDays } = getSandboxConfig()
  return new Date(from.getTime() + ttlDays * 24 * 60 * 60 * 1000)
}

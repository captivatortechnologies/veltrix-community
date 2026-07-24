// ========================================================================
// Drift-check schedule resolution.
//
// The scheduled sweep is frequency-aware per deployed config. The effective
// frequency is the PER-APP override (a DriftSchedule row keyed by the app slug)
// when set, else the TENANT default (the `*` row), else the built-in default.
// A config runs in a sweep only when it's due (now − lastDriftCheckAt ≥ window).
// ========================================================================

import type { PrismaClient } from '@prisma/client'

export const DRIFT_FREQUENCIES = ['off', 'hourly', 'daily', 'weekly'] as const
export type DriftFrequency = (typeof DRIFT_FREQUENCIES)[number]

/** Sentinel appId for the tenant-wide default schedule row. */
export const TENANT_DEFAULT_SCOPE = '*'

export const DEFAULT_DRIFT_FREQUENCY: DriftFrequency = 'hourly'

const WINDOW_MS: Record<Exclude<DriftFrequency, 'off'>, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}

export function isDriftFrequency(value: unknown): value is DriftFrequency {
  return typeof value === 'string' && (DRIFT_FREQUENCIES as readonly string[]).includes(value)
}

/**
 * Resolve the effective drift-check frequency for a config: per-app override
 * (appId row) beats the tenant default (`*` row) beats the built-in default.
 */
export async function effectiveDriftFrequency(
  db: PrismaClient,
  customerId: string,
  appId: string,
): Promise<DriftFrequency> {
  const rows = await db.driftSchedule.findMany({
    where: { customerId, appId: { in: [appId, TENANT_DEFAULT_SCOPE] } },
    select: { appId: true, frequency: true },
  })
  const perApp = rows.find((r) => r.appId === appId)?.frequency
  if (isDriftFrequency(perApp)) return perApp
  const tenant = rows.find((r) => r.appId === TENANT_DEFAULT_SCOPE)?.frequency
  if (isDriftFrequency(tenant)) return tenant
  return DEFAULT_DRIFT_FREQUENCY
}

/** Whether a config is due for a scheduled check, given its frequency + last check. */
export function isDue(frequency: DriftFrequency, lastCheckedAt: Date | null, now: number): boolean {
  if (frequency === 'off') return false
  if (!lastCheckedAt) return true
  return now - lastCheckedAt.getTime() >= WINDOW_MS[frequency]
}

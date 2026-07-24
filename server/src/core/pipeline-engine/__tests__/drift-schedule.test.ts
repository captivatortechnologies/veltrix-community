import {
  isDue,
  effectiveDriftFrequency,
  DEFAULT_DRIFT_FREQUENCY,
  TENANT_DEFAULT_SCOPE,
} from '../drift-schedule'
import type { PrismaClient } from '@prisma/client'

const HOUR = 3_600_000

describe('isDue', () => {
  it('off never runs', () => {
    expect(isDue('off', null, Date.now())).toBe(false)
    expect(isDue('off', new Date(0), Date.now())).toBe(false)
  })
  it('treats a never-checked config as due', () => {
    expect(isDue('hourly', null, 0)).toBe(true)
    expect(isDue('weekly', null, 0)).toBe(true)
  })
  it('hourly is due after an hour', () => {
    const now = 10 * HOUR
    expect(isDue('hourly', new Date(now - HOUR), now)).toBe(true)
    expect(isDue('hourly', new Date(now - HOUR / 2), now)).toBe(false)
  })
  it('daily / weekly windows', () => {
    const now = 100 * 24 * HOUR
    expect(isDue('daily', new Date(now - 25 * HOUR), now)).toBe(true)
    expect(isDue('daily', new Date(now - 23 * HOUR), now)).toBe(false)
    expect(isDue('weekly', new Date(now - 8 * 24 * HOUR), now)).toBe(true)
    expect(isDue('weekly', new Date(now - 6 * 24 * HOUR), now)).toBe(false)
  })
})

describe('effectiveDriftFrequency', () => {
  function db(rows: Array<{ appId: string; frequency: string }>): PrismaClient {
    return { driftSchedule: { findMany: async () => rows } } as unknown as PrismaClient
  }

  it('per-app override wins over the tenant default', async () => {
    const f = await effectiveDriftFrequency(
      db([{ appId: 'splunk-enterprise', frequency: 'daily' }, { appId: TENANT_DEFAULT_SCOPE, frequency: 'hourly' }]),
      'c',
      'splunk-enterprise',
    )
    expect(f).toBe('daily')
  })
  it('falls back to the tenant default when there is no per-app row', async () => {
    const f = await effectiveDriftFrequency(db([{ appId: TENANT_DEFAULT_SCOPE, frequency: 'weekly' }]), 'c', 'splunk-enterprise')
    expect(f).toBe('weekly')
  })
  it('falls back to the built-in default when nothing is configured', async () => {
    const f = await effectiveDriftFrequency(db([]), 'c', 'splunk-enterprise')
    expect(f).toBe(DEFAULT_DRIFT_FREQUENCY)
  })
  it('ignores an invalid stored frequency and keeps resolving down the chain', async () => {
    const f = await effectiveDriftFrequency(
      db([{ appId: 'splunk-enterprise', frequency: 'bogus' }, { appId: TENANT_DEFAULT_SCOPE, frequency: 'daily' }]),
      'c',
      'splunk-enterprise',
    )
    expect(f).toBe('daily')
  })
})

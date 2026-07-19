// ========================================================================
// Sandbox Runner Tests (real child processes)
//
// Spawns the actual runner entry against tiny CJS handler fixtures and
// verifies the isolation guarantees end-to-end:
//   - result + error propagation over IPC
//   - console capture with levels + streamed onLog callback
//   - env scrubbing (a sentinel env var must NOT be visible in the child)
//   - hard timeout SIGKILL for event-loop-blocking code
//   - soft timeout for never-resolving promises
//   - static platform snapshot reconstruction in the child
//   - per-customer concurrency semaphore
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  invokeSandboxHandler,
  tryAcquireRunnerSlot,
  releaseRunnerSlot,
  getActiveRunCount,
  buildRunnerEnv,
  MAX_CAPTURED_LOG_LINES,
} from '../runner/runner-invoker'
import type { RunnerLogLine, RunnerPlatformSnapshot } from '../runner/runner-ipc'

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const EMPTY_PLATFORM: RunnerPlatformSnapshot = { latestDeployment: null, components: [] }

describe('sandbox runner (child process)', () => {
  let fixtureDir: string

  function writeHandler(name: string, code: string): string {
    const file = path.join(fixtureDir, name)
    fs.writeFileSync(file, code)
    return file
  }

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-runner-test-'))
  })

  afterAll(() => {
    // Windows may briefly hold a lock on a just-exited child's fixture dir;
    // rmSync retries EPERM/EBUSY/ENOTEMPTY, and cleanup must never fail the run.
    try {
      fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    } catch {
      /* best-effort fixture cleanup */
    }
  })

  it('executes a handler, captures console output with levels and streams onLog', async () => {
    const handlerPath = writeHandler(
      'success.js',
      `module.exports = async (ctx) => {
        console.log('starting', { step: 1 })
        console.warn('careful')
        console.error('not fatal')
        return { valid: true, canvasName: ctx.canvas.name, env: ctx.environment.id }
      }`,
    )

    const streamed: RunnerLogLine[] = []
    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'validate',
      ctx: { canvas: { name: 'my-canvas' }, environment: { id: 'sandbox', name: 'sandbox' } },
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 8000,
      onLog: (line) => streamed.push(line),
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.error).toBeNull()
    expect(outcome.timedOut).toBe(false)
    expect(outcome.result).toEqual({ valid: true, canvasName: 'my-canvas', env: 'sandbox' })
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0)

    expect(outcome.logs).toEqual([
      { level: 'log', line: 'starting {"step":1}' },
      { level: 'warn', line: 'careful' },
      { level: 'error', line: 'not fatal' },
    ])
    // onLog receives the same lines as they stream in.
    expect(streamed).toEqual(outcome.logs)
  })

  it('propagates handler errors with their message', async () => {
    const handlerPath = writeHandler(
      'throws.js',
      `module.exports = async () => { throw new Error('boom: config invalid') }`,
    )

    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'validate',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 8000,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.result).toBeNull()
    expect(outcome.error).toContain('boom: config invalid')
  })

  it('scrubs the environment: platform env vars are invisible to the child', async () => {
    process.env.SANDBOX_TEST_SENTINEL = 'this-must-not-leak'
    try {
      const handlerPath = writeHandler(
        'env.js',
        `module.exports = async () => ({
          sentinel: process.env.SANDBOX_TEST_SENTINEL ?? null,
          databaseUrl: process.env.DATABASE_URL ?? null,
          jwtSecret: process.env.JWT_SECRET ?? null,
          nodeOptions: process.env.NODE_OPTIONS ?? null,
          sandboxMarker: process.env.VELTRIX_SANDBOX ?? null,
        })`,
      )

      const outcome = await invokeSandboxHandler({
        handlerPath,
        handlerName: 'validate',
        ctx: {},
        platformData: EMPTY_PLATFORM,
        cwd: fixtureDir,
        timeoutMs: 8000,
      })

      expect(outcome.ok).toBe(true)
      expect(outcome.result).toEqual({
        sentinel: null,
        databaseUrl: null,
        jwtSecret: null,
        nodeOptions: null,
        sandboxMarker: '1',
      })
    } finally {
      delete process.env.SANDBOX_TEST_SENTINEL
    }
  })

  it('buildRunnerEnv only allowlists PATH (+ SystemRoot on win32)', () => {
    const env = buildRunnerEnv()
    const allowed = new Set(['PATH', 'SystemRoot', 'VELTRIX_SANDBOX'])
    for (const key of Object.keys(env)) {
      expect(allowed.has(key)).toBe(true)
    }
    expect(env.VELTRIX_SANDBOX).toBe('1')
  })

  it('hard-kills event-loop-blocking handlers at the wall-clock timeout', async () => {
    const handlerPath = writeHandler(
      'busy.js',
      `module.exports = () => { for (;;) {} }`,
    )

    const started = Date.now()
    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'validate',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 1500,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.timedOut).toBe(true)
    expect(outcome.error).toMatch(/timeout/i)
    // Killed close to the limit, not left running.
    expect(Date.now() - started).toBeLessThan(8000)
  })

  it('returns a clean soft-timeout error for handlers that never resolve', async () => {
    const handlerPath = writeHandler(
      'hangs.js',
      `module.exports = () => new Promise(() => {})`,
    )

    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'getStatus',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 2500, // soft timeout fires at 2000, before the hard kill
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toMatch(/timed out/i)
  })

  it('rejects modules that do not export a function', async () => {
    const handlerPath = writeHandler('notafunction.js', `module.exports = { nope: 42 }`)

    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'validate',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 8000,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('does not export a function')
  })

  it('reports require failures for missing handler artifacts', async () => {
    const outcome = await invokeSandboxHandler({
      handlerPath: path.join(fixtureDir, 'does-not-exist.js'),
      handlerName: 'validate',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 8000,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toMatch(/Cannot find module/i)
  })

  it('reconstructs the static platform snapshot inside the child', async () => {
    const handlerPath = writeHandler(
      'platform.js',
      `module.exports = async (ctx) => ({
        latest: await ctx.platform.getLatestDeployment('whatever'),
        all: await ctx.platform.listComponents(),
        filtered: await ctx.platform.listComponents({ types: ['edr-console'] }),
      })`,
    )

    const platformData: RunnerPlatformSnapshot = {
      latestDeployment: null,
      components: [
        { id: 'c1', hostname: 'edr.dev', port: '443', type: ['edr-console'], toolId: 't1' },
        { id: 'c2', hostname: 'other.dev', port: '22', type: ['siem'], toolId: 't2' },
      ],
    }

    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'getStatus',
      ctx: {},
      platformData,
      cwd: fixtureDir,
      timeoutMs: 8000,
    })

    expect(outcome.ok).toBe(true)
    const result = outcome.result as { latest: unknown; all: unknown[]; filtered: unknown[] }
    expect(result.latest).toBeNull()
    expect(result.all).toHaveLength(2)
    expect(result.filtered).toEqual([platformData.components[0]])
  })

  it('caps captured log lines to guard server memory', async () => {
    const handlerPath = writeHandler(
      'chatty.js',
      `module.exports = async () => {
        for (let i = 0; i < ${MAX_CAPTURED_LOG_LINES + 100}; i++) console.log('line', i)
        return { done: true }
      }`,
    )

    const outcome = await invokeSandboxHandler({
      handlerPath,
      handlerName: 'validate',
      ctx: {},
      platformData: EMPTY_PLATFORM,
      cwd: fixtureDir,
      timeoutMs: 8000,
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.logs.length).toBe(MAX_CAPTURED_LOG_LINES + 1) // + truncation marker
    expect(outcome.logs[outcome.logs.length - 1].line).toMatch(/truncated/)
  })
})

describe('per-customer concurrency semaphore', () => {
  const CUSTOMER = 'cust-semaphore-test'

  afterEach(() => {
    // Drain whatever the test acquired.
    while (getActiveRunCount(CUSTOMER) > 0) releaseRunnerSlot(CUSTOMER)
  })

  it('enforces the cap and frees slots on release', () => {
    expect(tryAcquireRunnerSlot(CUSTOMER, 2)).toBe(true)
    expect(tryAcquireRunnerSlot(CUSTOMER, 2)).toBe(true)
    expect(tryAcquireRunnerSlot(CUSTOMER, 2)).toBe(false)
    expect(getActiveRunCount(CUSTOMER)).toBe(2)

    releaseRunnerSlot(CUSTOMER)
    expect(tryAcquireRunnerSlot(CUSTOMER, 2)).toBe(true)
  })

  it('tracks customers independently', () => {
    expect(tryAcquireRunnerSlot(CUSTOMER, 1)).toBe(true)
    expect(tryAcquireRunnerSlot('other-customer', 1)).toBe(true)
    expect(tryAcquireRunnerSlot(CUSTOMER, 1)).toBe(false)
    releaseRunnerSlot('other-customer')
  })
})

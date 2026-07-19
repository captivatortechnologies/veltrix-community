// ========================================================================
// Sandbox Runner — parent-side invoker
//
// Spawns one child process per handler invocation (sandbox-runner-entry)
// and enforces every isolation guarantee the main server relies on:
//
//   - the server process NEVER require()s sandbox code; only the child does
//   - env scrubbed to a minimal allowlist (PATH + SystemRoot on win32);
//     no DATABASE_URL, JWT_SECRET, REDIS_URL, NODE_OPTIONS, cloud creds, ...
//   - cwd pinned to the sandbox directory
//   - V8 heap cap via --max-old-space-size
//   - hard wall-clock timeout -> SIGKILL (child also runs a soft timeout so
//     it can usually report a clean error first)
//   - per-customer concurrency semaphore (simple in-memory counter; single
//     server process today — revisit when the API tier scales out)
//   - console output captured as levelled log lines, streamed via onLog
// ========================================================================

import { fork } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { transformSync } from 'esbuild'
import { getSandboxConfig } from '../sandbox.config'
import type {
  RunnerChildMessage,
  RunnerLogLine,
  RunnerPlatformSnapshot,
  SandboxRunMessage,
} from './runner-ipc'

/** Upper bound on captured log lines per run (memory guard). */
export const MAX_CAPTURED_LOG_LINES = 500

export interface InvokeSandboxHandlerOptions {
  /** Absolute path to the transpiled CJS handler artifact. */
  handlerPath: string
  handlerName: string
  /** JSON-serializable context (no functions, no prisma objects). */
  ctx: Record<string, unknown>
  /** Pre-resolved static platform data (see runner-ipc.ts). */
  platformData: RunnerPlatformSnapshot
  /** Working directory for the child — the sandbox dir. */
  cwd: string
  timeoutMs?: number
  maxOldSpaceMb?: number
  /** Streamed per-line callback (used for WS log streaming). */
  onLog?: (line: RunnerLogLine) => void
}

export interface SandboxRunOutcome {
  ok: boolean
  result: unknown
  error: string | null
  timedOut: boolean
  logs: RunnerLogLine[]
  durationMs: number
}

// ---------------------------------------------------------------------------
// Env scrubbing
// ---------------------------------------------------------------------------

/**
 * Minimal environment for the child. Nothing from the platform's env leaks
 * through — notably DATABASE_URL, REDIS_URL, JWT_SECRET, API keys and
 * NODE_OPTIONS (which could re-inject flags) are all absent by construction.
 */
export function buildRunnerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    // Marker sandbox code can use to detect it runs inside the runner.
    VELTRIX_SANDBOX: '1',
  }
  if (process.env.PATH) env.PATH = process.env.PATH
  if (process.platform === 'win32' && process.env.SystemRoot) {
    // node's networking/crypto init needs SystemRoot on Windows.
    env.SystemRoot = process.env.SystemRoot
  }
  return env
}

// ---------------------------------------------------------------------------
// Per-customer concurrency semaphore
// ---------------------------------------------------------------------------

const activeRunsByCustomer = new Map<string, number>()

export function tryAcquireRunnerSlot(customerId: string, cap: number): boolean {
  const current = activeRunsByCustomer.get(customerId) ?? 0
  if (current >= cap) return false
  activeRunsByCustomer.set(customerId, current + 1)
  return true
}

export function releaseRunnerSlot(customerId: string): void {
  const current = activeRunsByCustomer.get(customerId) ?? 0
  if (current <= 1) {
    activeRunsByCustomer.delete(customerId)
  } else {
    activeRunsByCustomer.set(customerId, current - 1)
  }
}

export function getActiveRunCount(customerId: string): number {
  return activeRunsByCustomer.get(customerId) ?? 0
}

// ---------------------------------------------------------------------------
// Runner entry resolution
// ---------------------------------------------------------------------------

let cachedEntryPath: string | null = null

/**
 * Locate the runnable entry script. In production the sibling .js exists
 * (tsc compiles runner/ with the server). Under ts-jest/ts-node only the
 * .ts source exists, so transpile it once (content-addressed cache in the
 * OS temp dir) — the entry is self-contained, so a single-file transform
 * is sufficient.
 */
export function resolveRunnerEntry(): string {
  if (cachedEntryPath && fs.existsSync(cachedEntryPath)) return cachedEntryPath

  const compiled = path.join(__dirname, 'sandbox-runner-entry.js')
  if (fs.existsSync(compiled)) {
    cachedEntryPath = compiled
    return compiled
  }

  const sourcePath = path.join(__dirname, 'sandbox-runner-entry.ts')
  const source = fs.readFileSync(sourcePath, 'utf-8')
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16)
  const outDir = path.join(os.tmpdir(), 'veltrix-sandbox-runner')
  const outPath = path.join(outDir, `entry-${hash}.js`)

  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outDir, { recursive: true })
    const { code } = transformSync(source, {
      loader: 'ts',
      format: 'cjs',
      platform: 'node',
      target: 'node20',
      sourcefile: sourcePath,
    })
    fs.writeFileSync(outPath, code)
  }

  cachedEntryPath = outPath
  return outPath
}

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

export function invokeSandboxHandler(
  options: InvokeSandboxHandlerOptions,
): Promise<SandboxRunOutcome> {
  const config = getSandboxConfig()
  const timeoutMs = options.timeoutMs ?? config.runnerTimeoutMs
  const maxOldSpaceMb = options.maxOldSpaceMb ?? config.runnerMaxOldSpaceMb
  const entryPath = resolveRunnerEntry()
  const startedAt = Date.now()

  const logs: RunnerLogLine[] = []
  let logsTruncated = false
  const pushLog = (line: RunnerLogLine): void => {
    if (logsTruncated) return
    if (logs.length >= MAX_CAPTURED_LOG_LINES) {
      logsTruncated = true
      const marker: RunnerLogLine = {
        level: 'warn',
        line: `[runner] log output truncated after ${MAX_CAPTURED_LOG_LINES} lines`,
      }
      logs.push(marker)
      options.onLog?.(marker)
      return
    }
    logs.push(line)
    options.onLog?.(line)
  }

  return new Promise<SandboxRunOutcome>((resolve) => {
    let settled = false
    let timedOut = false
    let stderrTail = ''

    // windowsHide is honored by the underlying spawn but missing from this
    // @types/node ForkOptions revision — hence the assertion.
    const forkOptions = {
      cwd: options.cwd,
      env: buildRunnerEnv(),
      execArgv: [`--max-old-space-size=${maxOldSpaceMb}`],
      windowsHide: true,
      // Pipe stdio: sandbox code must never write to the server's stdio.
      silent: true,
      serialization: 'json',
    } as import('child_process').ForkOptions

    const child = fork(entryPath, [], forkOptions)

    const killTimer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
      settle({
        ok: false,
        result: null,
        error: `Sandbox run exceeded the ${timeoutMs} ms timeout and was terminated`,
        timedOut: true,
      })
    }, timeoutMs)

    const settle = (outcome: Omit<SandboxRunOutcome, 'logs' | 'durationMs'>): void => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      // Whatever happened, make sure the child is gone.
      if (child.exitCode === null && !child.killed) {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }
      resolve({ ...outcome, logs, durationMs: Date.now() - startedAt })
    }

    // Raw stream fallback: console.* is IPC-captured in the child, so these
    // only fire for direct process.stdout/stderr writes and runtime aborts
    // (e.g. the OOM killer message lands on stderr).
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const raw of chunk.toString('utf-8').split(/\r?\n/)) {
        if (raw.trim()) pushLog({ level: 'info', line: raw })
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderrTail = (stderrTail + text).slice(-2000)
      for (const raw of text.split(/\r?\n/)) {
        if (raw.trim()) pushLog({ level: 'error', line: raw })
      }
    })

    child.on('message', (raw: unknown) => {
      const msg = raw as RunnerChildMessage
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'log') {
        pushLog({ level: msg.level, line: msg.line })
      } else if (msg.type === 'result') {
        if (msg.ok) {
          settle({ ok: true, result: msg.result ?? null, error: null, timedOut: false })
        } else {
          settle({
            ok: false,
            result: null,
            error: msg.error ?? 'Sandbox handler failed without an error message',
            timedOut: false,
          })
        }
      }
    })

    child.on('error', (err) => {
      settle({
        ok: false,
        result: null,
        error: `Failed to start sandbox runner: ${err.message}`,
        timedOut: false,
      })
    })

    child.on('exit', (code, signal) => {
      if (settled) return
      // Under IPC backpressure the 'exit' event can be dispatched while a
      // queued 'result' message is still in flight — give it a brief grace
      // period to arrive (message handlers settle first and win).
      setTimeout(() => {
        if (settled) return
        const detail = stderrTail.trim()
        settle({
          ok: false,
          result: null,
          error:
            `Sandbox runner exited before returning a result ` +
            `(code ${code}, signal ${signal})${detail ? `: ${detail}` : ''}`,
          timedOut,
        })
      }, 250)
    })

    const runMessage: SandboxRunMessage = {
      type: 'run',
      handlerPath: options.handlerPath,
      handlerName: options.handlerName,
      timeoutMs,
      ctx: options.ctx,
      platformData: options.platformData,
    }
    child.send(runMessage, (err) => {
      if (err) {
        settle({
          ok: false,
          result: null,
          error: `Failed to send run request to the sandbox runner: ${err.message}`,
          timedOut: false,
        })
      }
    })
  })
}

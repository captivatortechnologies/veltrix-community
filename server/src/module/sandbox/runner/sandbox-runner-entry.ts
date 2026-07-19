// ========================================================================
// Sandbox Runner — child process entry
//
// Invoked by runner-invoker.ts as `node sandbox-runner-entry.js` with an
// IPC channel. Receives ONE {type:'run'} message, require()s the tenant's
// transpiled handler, executes it with the reconstructed context and
// reports {type:'result'} back, then exits. All console output is captured
// and streamed to the parent as {type:'log'} messages.
//
// ISOLATION NOTES
//   - This file must stay SELF-CONTAINED: node builtins only, and only
//     `import type` from runner-ipc (erased at compile time). It is the
//     single place tenant code is ever require()d — never in the server.
//   - The parent launches it with a scrubbed env (no platform secrets),
//     cwd inside the sandbox dir, --max-old-space-size cap, and a hard
//     SIGKILL timeout. The soft timeout below only exists to return a
//     clean error before the parent resorts to the kill.
//   - v1 floor is process isolation (per the sandbox-dev-mode plan);
//     container-class isolation lands before GA.
// ========================================================================

import type {
  RunnerChildMessage,
  RunnerLogLevel,
  RunnerPlatformSnapshot,
  RunnerResultMessage,
  SandboxRunMessage,
} from './runner-ipc'

let finished = false

function send(message: RunnerChildMessage): void {
  try {
    if (process.send) process.send(message)
  } catch {
    // IPC channel gone (parent died / killed us) — nothing left to report to.
  }
}

function finish(message: RunnerResultMessage): void {
  if (finished) return
  finished = true
  if (process.send) {
    // Flush the result over IPC before exiting.
    process.send(message, undefined, undefined, () => {
      process.exit(message.ok ? 0 : 1)
    })
  } else {
    process.exit(message.ok ? 0 : 1)
  }
}

// ---------------------------------------------------------------------------
// Console capture: every console.* call becomes a streamed log message.
// ---------------------------------------------------------------------------

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.stack || arg.message
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

const LOG_LEVELS: RunnerLogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
for (const level of LOG_LEVELS) {
  // eslint-disable-next-line no-console
  console[level] = (...args: unknown[]) => {
    send({ type: 'log', level, line: args.map(formatArg).join(' ') })
  }
}

// ---------------------------------------------------------------------------
// Static platform data -> PlatformDataApi-shaped object (see runner-ipc.ts)
// ---------------------------------------------------------------------------

function buildPlatformApi(data: RunnerPlatformSnapshot) {
  return {
    async getLatestDeployment(): Promise<RunnerPlatformSnapshot['latestDeployment']> {
      return data.latestDeployment
    },
    async listComponents(filter?: {
      types?: string[]
    }): Promise<RunnerPlatformSnapshot['components']> {
      if (!filter?.types?.length) return data.components
      const wanted = filter.types
      return data.components.filter((c) => c.type.some((t) => wanted.includes(t)))
    },
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

async function run(msg: SandboxRunMessage): Promise<void> {
  try {
    // The one and only place tenant code is loaded — inside this child.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(msg.handlerPath)
    const handler = mod && (mod.default || mod)
    if (typeof handler !== 'function') {
      finish({
        type: 'result',
        ok: false,
        error: `Handler "${msg.handlerName}" (${msg.handlerPath}) does not export a function`,
      })
      return
    }

    const ctx = { ...msg.ctx, platform: buildPlatformApi(msg.platformData) }

    // Soft timeout: leave the parent ~500 ms to receive a clean error
    // before its hard SIGKILL fires.
    const softTimeoutMs = Math.max(1000, msg.timeoutMs - 500)
    const result = await Promise.race([
      Promise.resolve(handler(ctx)),
      new Promise((_resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Handler "${msg.handlerName}" timed out after ${softTimeoutMs} ms`)),
          softTimeoutMs,
        )
        // Never keep the process alive just for the timeout.
        if (typeof timer.unref === 'function') timer.unref()
      }),
    ])

    finish({ type: 'result', ok: true, result: toJsonSafe(result) })
  } catch (err) {
    finish({
      type: 'result',
      ok: false,
      error: err instanceof Error ? err.stack || err.message : String(err),
    })
  }
}

process.on('uncaughtException', (err) => {
  finish({ type: 'result', ok: false, error: `Uncaught exception: ${err.stack || err.message}` })
})

process.on('unhandledRejection', (reason) => {
  finish({
    type: 'result',
    ok: false,
    error: `Unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`,
  })
})

process.on('message', (raw: unknown) => {
  const msg = raw as SandboxRunMessage
  if (msg && msg.type === 'run') {
    void run(msg)
  }
})

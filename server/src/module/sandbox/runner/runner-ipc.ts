// ========================================================================
// Sandbox Runner IPC Contract
//
// Message shapes exchanged between the parent-side invoker
// (runner-invoker.ts) and the child runner process
// (sandbox-runner-entry.ts). The entry script imports these with
// `import type` ONLY, so it stays dependency-free at runtime.
// ========================================================================

export type RunnerLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface RunnerLogLine {
  level: RunnerLogLevel
  line: string
}

/**
 * Pre-resolved, static platform data embedded in the run request.
 *
 * DESIGN DECISION (v1): the child process gets NO live data API and no
 * database access of any kind. The parent fetches a snapshot BEFORE the
 * spawn (components restricted to sandbox-tagged ones; latestDeployment is
 * always null because sandbox canvases have no deployment history) and the
 * child reconstructs a PlatformDataApi-shaped object over it. Handlers keep
 * the same `ctx.platform.listComponents()/getLatestDeployment()` contract,
 * but reads reflect the moment the run started.
 */
export interface RunnerPlatformSnapshot {
  latestDeployment: null | {
    id: string
    canvasId: string
    status: string
    healthScore: number | null
    startedAt: string
    completedAt: string | null
    environment: { id: string; name: string }
  }
  components: Array<{
    id: string
    hostname: string
    port: string
    type: string[]
    toolId: string
  }>
}

/** Parent -> child: execute one handler. Exactly one per child lifetime. */
export interface SandboxRunMessage {
  type: 'run'
  /** Absolute path to the transpiled CJS handler artifact. */
  handlerPath: string
  handlerName: string
  /** Soft deadline hint; the parent enforces the hard kill regardless. */
  timeoutMs: number
  /** JSON-serializable PipelineContext (minus `platform`, added child-side). */
  ctx: Record<string, unknown>
  platformData: RunnerPlatformSnapshot
}

/** Child -> parent: final outcome. `result` set when ok, `error` when not. */
export interface RunnerResultMessage {
  type: 'result'
  ok: boolean
  result?: unknown
  error?: string
}

/** Child -> parent messages. */
export type RunnerChildMessage =
  | { type: 'log'; level: RunnerLogLevel; line: string }
  | RunnerResultMessage

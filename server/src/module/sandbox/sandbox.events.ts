// ========================================================================
// Sandbox WebSocket Events
//
// Publishes sandbox lifecycle/sync events to the owning customer's tenant
// channel through the shared WebSocketServer (lib/websocket-server), the
// same way deployment-events does. The WebSocketServer instance is injected
// at bootstrap (wherever the HTTP server wires WebSocketServer up) via
// setSandboxWebSocketServer(); until then emits are no-ops so the module
// stays fully functional in environments without realtime (tests, workers).
//
// Events:
//   sandbox:synced       - a file sync finished (includes validation summary)
//   sandbox:status       - sandbox status transition (ACTIVE/SYNCING/ERROR/EXPIRED)
//   sandbox:log          - batched console lines streamed from a runner run
//   sandbox:run-result   - final outcome of a POST /:id/run invocation
//   sandbox:file-changed - a single file was written/deleted via the file API
//                          (portal editor or CLI); hash-stamped so peers can
//                          echo-guard their own writes (see plan §"Loop prevention")
//   sandbox:validation   - the sandbox's validity after a single-file mutation
// ========================================================================

import type { WebSocketServer } from '../../lib/websocket-server'
import { loggerService } from '../logger/logger.service'
import type {
  RunnableSandboxHandler,
  SandboxRunLogLine,
  SandboxStatusValue,
  SyncValidationResult,
} from './sandbox.schemas'

export enum SandboxEventType {
  SYNCED = 'sandbox:synced',
  STATUS = 'sandbox:status',
  LOG = 'sandbox:log',
  RUN_RESULT = 'sandbox:run-result',
  FILE_CHANGED = 'sandbox:file-changed',
  VALIDATION = 'sandbox:validation',
}

/** Which peer authored a file mutation (for echo-guarding, see plan §"Loop prevention"). */
export type SandboxFileOrigin = 'portal' | 'cli'

export interface SandboxSyncedEvent {
  sandboxId: string
  name: string
  appId: string
  status: SandboxStatusValue
  fileCount: number
  sizeBytes: number
  validation: SyncValidationResult
}

export interface SandboxStatusEvent {
  sandboxId: string
  name: string
  status: SandboxStatusValue
  message?: string
}

export interface SandboxLogEvent {
  sandboxId: string
  runId: string
  lines: SandboxRunLogLine[]
}

export interface SandboxRunResultEvent {
  sandboxId: string
  runId: string
  handler: RunnableSandboxHandler
  configTypeId: string
  ok: boolean
  error: string | null
  timedOut: boolean
  durationMs: number
}

export interface SandboxFileChangedEvent {
  sandboxId: string
  path: string
  /** New content hash, or '' when the file was deleted. */
  sha256: string
  /** Prior content hash, or null when the file did not exist before. */
  previousSha256: string | null
  /** New size in bytes, or 0 when the file was deleted. */
  size: number
  origin: SandboxFileOrigin
  /** Opaque id of the writing client; a peer ignores events carrying its own id. */
  originClientId: string | null
}

export interface SandboxValidationEvent {
  sandboxId: string
  /** The file whose mutation triggered this re-validation. */
  path: string
  validation: SyncValidationResult
}

let wsServer: WebSocketServer | null = null

/** Inject the shared WebSocketServer instance (call once at bootstrap). */
export function setSandboxWebSocketServer(server: WebSocketServer): void {
  wsServer = server
}

function emitToTenant(customerId: string, event: SandboxEventType, payload: object): void {
  if (!wsServer) {
    loggerService.debug(`Sandbox events: WebSocket server not wired; skipping ${event}`)
    return
  }
  wsServer.emitToTenant(customerId, event, { ...payload, timestamp: Date.now() })
}

export const sandboxEvents = {
  emitSynced(customerId: string, event: SandboxSyncedEvent): void {
    emitToTenant(customerId, SandboxEventType.SYNCED, event)
  },

  emitStatus(customerId: string, event: SandboxStatusEvent): void {
    emitToTenant(customerId, SandboxEventType.STATUS, event)
  },

  emitLog(customerId: string, event: SandboxLogEvent): void {
    emitToTenant(customerId, SandboxEventType.LOG, event)
  },

  emitRunResult(customerId: string, event: SandboxRunResultEvent): void {
    emitToTenant(customerId, SandboxEventType.RUN_RESULT, event)
  },

  emitFileChanged(customerId: string, event: SandboxFileChangedEvent): void {
    emitToTenant(customerId, SandboxEventType.FILE_CHANGED, event)
  },

  emitValidation(customerId: string, event: SandboxValidationEvent): void {
    emitToTenant(customerId, SandboxEventType.VALIDATION, event)
  },
}

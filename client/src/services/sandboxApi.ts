import { API_URL } from '@/config'
import type { AppPageDeclaration } from '../../../shared/types/app'

// ---------------------------------------------------------------------------
// Types (mirrors server/src/module/sandbox/sandbox.schemas.ts)
// ---------------------------------------------------------------------------

export const SANDBOX_STATUSES = ['ACTIVE', 'SYNCING', 'ERROR', 'EXPIRED'] as const

export type SandboxStatus = (typeof SANDBOX_STATUSES)[number]

export interface Sandbox {
  id: string
  customerId: string
  name: string
  appId: string
  status: SandboxStatus
  createdById: string | null
  lastSyncAt: string | null
  fileCount: number
  sizeBytes: number
  expiresAt: string
  createdAt: string
  updatedAt: string
}

/** One configuration type declared by the synced manifest, with its declared handler names. */
export interface SandboxManifestConfigType {
  id: string
  name: string
  handlers: string[]
}

/**
 * The manifest's `client` block (S6.5) — everything the Preview surface
 * needs to run the app's own UI inside the sandbox. `null` when the
 * manifest declares no `client` block at all.
 */
export interface SandboxManifestClientSummary {
  /** The manifest's raw client.entry path, or null when undeclared. */
  entry: string | null
  pages: AppPageDeclaration[]
}

/** Manifest + live validation summary — null until the sandbox has synced at least once. */
export interface SandboxManifestSummary {
  appId: string
  name: string
  version: string
  configTypes: SandboxManifestConfigType[]
  client: SandboxManifestClientSummary | null
  valid: boolean
  errors: string[]
  warnings: string[]
  transpiledCount: number
}

/** POST /:id/config-types body — scaffold a new configuration type into a synced sandbox. */
export interface AddConfigTypeRequest {
  /** Slug: lowercase, digits, single hyphens; must start/end alphanumeric. */
  id: string
  /** Human label; defaults to a title-cased id server-side when omitted. */
  name?: string
  /** Component types the config type targets; freeform per app. */
  componentTypes?: string[]
  /** Echoed on the resulting file-changed events so this client echo-guards its own writes. */
  originClientId?: string
}

/** POST /:id/config-types response — the new id, the files written, and the refreshed manifest. */
export interface AddConfigTypeResponse {
  configTypeId: string
  createdPaths: string[]
  manifest: SandboxManifestSummary | null
}

/** GET /:id response: the base sandbox row + its live manifest summary. */
export interface SandboxDetail extends Sandbox {
  manifest: SandboxManifestSummary | null
}

/**
 * Manifest validity after a single-file mutation (PUT/DELETE …/file). Mirrors
 * server SyncValidationResult (sandbox.schemas.ts) — the "checks on edit" the
 * editor surfaces immediately after a save.
 */
export interface SyncValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  manifest: { id: string; name: string; version: string } | null
  transpiledCount: number
}

/** One synced file's metadata, as recorded in the sandbox's sync manifest state. */
export interface SandboxFile {
  path: string
  sha256: string
  size: number
}

export interface SandboxFilesPage {
  files: SandboxFile[]
  totalCount: number
  totalBytes: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------------------
// Single-file read/write/delete (in-browser editor, S6.3)
// ---------------------------------------------------------------------------

/** GET …/file response. Text is UTF-8 and capped at 256 KB (`truncated: true` when larger,
 * in which case the editor must treat it as read-only); binary content is base64. */
export interface SandboxFileContent {
  path: string
  sha256: string
  size: number
  content: string
  encoding: 'utf8' | 'base64'
  truncated: boolean
}

export interface SandboxFileWriteRequest {
  path: string
  content: string
  encoding: 'utf8' | 'base64'
  /** Omit to force-overwrite (conflict "Overwrite" action); pass the sha256 the editor
   * loaded to get optimistic concurrency (409 on mismatch). */
  expectedSha256?: string
  /** Opaque per-page-session id; the server echoes it on the resulting sandbox:file-changed
   * event so this same client can ignore its own write (loop prevention). */
  originClientId?: string
}

export interface SandboxFileWriteResponse {
  sha256: string
  size: number
  validation: SyncValidationResult
}

export interface SandboxFileDeleteResponse {
  path: string
  deleted: boolean
  validation: SyncValidationResult
}

/** Payload of the `sandbox:file-changed` realtime event (see RealtimeContext /
 * server sandbox.events.ts SandboxFileChangedEvent). Declared here, not imported from the
 * server, since the client only ever sees it as an untyped socket payload. */
export interface SandboxFileChangedPayload {
  sandboxId: string
  path: string
  /** New content hash, or '' when the file was deleted. */
  sha256: string
  previousSha256: string | null
  size: number
  origin: 'portal' | 'cli'
  originClientId: string | null
}

/**
 * Handlers that may be executed in a sandbox. deploy/rollback mutate
 * external systems and are intentionally excluded from v1. Order/values
 * mirror the server's single source of truth
 * (server/src/core/pipeline-engine/types.ts RUNNABLE_HANDLER_NAMES).
 */
export const RUNNABLE_SANDBOX_HANDLERS = ['validate', 'healthCheck', 'driftDetect', 'getStatus'] as const
export type RunnableSandboxHandler = (typeof RUNNABLE_SANDBOX_HANDLERS)[number]

export interface SandboxRunLogLine {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  line: string
}

export interface RunSandboxCanvasInput {
  name?: string
  sections?: Array<{ name: string; fields?: Record<string, unknown> }>
}

export interface RunSandboxRequest {
  configTypeId: string
  handler: RunnableSandboxHandler
  canvas?: RunSandboxCanvasInput
  componentId?: string
}

export interface RunSandboxResponse {
  runId: string
  handler: RunnableSandboxHandler
  configTypeId: string
  ok: boolean
  result: unknown
  error: string | null
  timedOut: boolean
  durationMs: number
  logs: SandboxRunLogLine[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Thrown for any non-2xx sandbox API response; carries the HTTP status so callers
 * (e.g. the run panel) can distinguish 409/410/429 from a generic failure. */
export class SandboxApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'SandboxApiError'
  }
}

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/**
 * Headers for requests that carry NO body. Sending Content-Type: application/json
 * with an empty body makes Fastify's JSON parser reject it (400
 * FST_ERR_CTP_EMPTY_JSON_BODY), so the header must be omitted.
 */
const getAuthHeadersNoContentType = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new SandboxApiError(body.error || `Request failed: ${response.status}`, response.status)
  }
  return response.json()
}

// ---------------------------------------------------------------------------
// API (read + delete + run — the full sync dev loop lives in the Veltrix CLI)
// ---------------------------------------------------------------------------

export const sandboxApi = {
  list: async (): Promise<Sandbox[]> => {
    const res = await fetch(`${API_URL}/sandboxes`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<Sandbox[]>(res)
  },

  get: async (id: string): Promise<SandboxDetail> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<SandboxDetail>(res)
  },

  getFiles: async (
    id: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<SandboxFilesPage> => {
    const params = new URLSearchParams()
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.offset !== undefined) params.set('offset', String(options.offset))
    const qs = params.toString()
    const res = await fetch(`${API_URL}/sandboxes/${id}/files${qs ? `?${qs}` : ''}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<SandboxFilesPage>(res)
  },

  getFile: async (id: string, path: string): Promise<SandboxFileContent> => {
    const params = new URLSearchParams({ path })
    const res = await fetch(`${API_URL}/sandboxes/${id}/file?${params.toString()}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<SandboxFileContent>(res)
  },

  putFile: async (id: string, body: SandboxFileWriteRequest): Promise<SandboxFileWriteResponse> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}/file`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse<SandboxFileWriteResponse>(res)
  },

  deleteFile: async (
    id: string,
    path: string,
    originClientId?: string,
  ): Promise<SandboxFileDeleteResponse> => {
    const params = new URLSearchParams({ path })
    if (originClientId) params.set('originClientId', originClientId)
    const res = await fetch(`${API_URL}/sandboxes/${id}/file?${params.toString()}`, {
      method: 'DELETE',
      headers: getAuthHeadersNoContentType(),
    })
    return handleResponse<SandboxFileDeleteResponse>(res)
  },

  /**
   * Fetch the sandbox app's client bundle SOURCE (raw JavaScript text, not
   * JSON) for the Preview surface to blob-import (S6.5). A plain
   * `import('/api/sandboxes/:id/client.mjs')` cannot carry the
   * Authorization header this endpoint requires (sandbox code is
   * tenant-private, unlike installed-app bundles) — see
   * pages/sandboxes/previewBundle.ts for the blob-import step.
   */
  getClientBundleSource: async (id: string): Promise<string> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}/client.mjs`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new SandboxApiError(body.error || `Request failed: ${res.status}`, res.status)
    }
    return res.text()
  },

  run: async (id: string, body: RunSandboxRequest): Promise<RunSandboxResponse> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}/run`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse<RunSandboxResponse>(res)
  },

  /**
   * Scaffold a new configuration type into the synced app: writes the canonical
   * config-types/<id>/ layout + a manifest entry server-side, then reverse-syncs
   * the new files to the developer's local workspace via sandbox:file-changed.
   */
  addConfigType: async (id: string, body: AddConfigTypeRequest): Promise<AddConfigTypeResponse> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}/config-types`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
    return handleResponse<AddConfigTypeResponse>(res)
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/sandboxes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeadersNoContentType(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new SandboxApiError(body.error || `Request failed: ${res.status}`, res.status)
    }
  },
}

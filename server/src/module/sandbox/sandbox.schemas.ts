// ========================================================================
// Sandbox Schemas
//
// TypeScript types + Fastify JSON schemas for the sandbox module.
// NOTE: Fastify response schemas strip undeclared fields in this codebase,
// so EVERY response field must be declared here.
// ========================================================================

import { RUNNABLE_HANDLER_NAMES, type HandlerName } from '../../core/pipeline-engine/types'
import type { AppPageDeclaration } from '../../../../shared/types/app'

export const SANDBOX_STATUSES = ['ACTIVE', 'SYNCING', 'ERROR', 'EXPIRED'] as const
export type SandboxStatusValue = (typeof SANDBOX_STATUSES)[number]

/** Same slug rules the app engine enforces for app IDs. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
export const SLUG_PATTERN = '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
export const MAX_NAME_LENGTH = 64

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface SandboxResponse {
  id: string
  customerId: string
  name: string
  appId: string
  status: SandboxStatusValue
  createdById: string | null
  lastSyncAt: Date | null
  fileCount: number
  sizeBytes: number
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface CreateSandboxRequest {
  name: string
  appId: string
}

/** One file the CLI reports in its local manifest. */
export interface SyncManifestEntry {
  path: string
  sha256: string
  size: number
}

export interface SyncManifestResponse {
  upload: string[]
  delete: string[]
}

export interface SyncValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  manifest: { id: string; name: string; version: string } | null
  transpiledCount: number
}

export interface SyncFilesResponse {
  status: SandboxStatusValue
  fileCount: number
  sizeBytes: number
  lastSyncAt: Date
  expiresAt: Date
  validation: SyncValidationResult
}

// ---------------------------------------------------------------------------
// Detail-view read APIs (S5 UI) — GET /:id/files + GET /:id manifest summary
// ---------------------------------------------------------------------------

/** One synced file's metadata, as recorded in .veltrix-sync-state.json. */
export interface SandboxFileEntry {
  path: string
  sha256: string
  size: number
}

export interface SandboxFilesQuery {
  limit?: number
  offset?: number
}

export interface SandboxFilesPage {
  files: SandboxFileEntry[]
  totalCount: number
  totalBytes: number
  limit: number
  offset: number
}

export const DEFAULT_FILES_PAGE_LIMIT = 500
export const MAX_FILES_PAGE_LIMIT = 1000

/** One configuration type declared by the synced manifest, with its declared handler names. */
export interface SandboxManifestConfigType {
  id: string
  name: string
  handlers: string[]
}

/**
 * The manifest's `client` block (S6.5) — everything the portal's sandbox
 * Preview needs to run the app's own UI inside the sandbox: whether a
 * client entry is declared at all, and the declared pages honoring the
 * shared nav contract (shared/types/app.ts AppPageDeclaration). `null` when
 * the manifest declares no `client` block whatsoever.
 */
export interface SandboxManifestClientSummary {
  /** The manifest's raw client.entry path, or null when undeclared. */
  entry: string | null
  pages: AppPageDeclaration[]
}

/**
 * Manifest + live validation summary for the sandbox detail view. Re-derived
 * from the currently synced sources on every request (see
 * sync.service.getManifestSummary) rather than cached, so it always
 * reflects reality even if a resync happened moments ago.
 */
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

// ---------------------------------------------------------------------------
// File read/write APIs (S6.2) — single-file editor access to synced content
// ---------------------------------------------------------------------------

/** Query for GET/DELETE …/file (path is the sandbox-relative file path). */
export interface SandboxFilePathQuery {
  path: string
  /** Echoed on the resulting sandbox:file-changed event so peers can echo-guard. */
  originClientId?: string
}

/** GET …/file response. Text ≤256 KB is UTF-8; larger/binary content is base64 and/or truncated. */
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
  /** Optimistic concurrency: the hash the client last read; a mismatch is a 409. */
  expectedSha256?: string
  originClientId?: string
}

export interface SandboxFileWriteResult {
  sha256: string
  size: number
  validation: SyncValidationResult
}

export interface SandboxFileDeleteResult {
  path: string
  deleted: boolean
  validation: SyncValidationResult
}

/** POST …/config-types — scaffold a new configuration type into a synced sandbox. */
export interface AddConfigTypeRequest {
  id: string
  name?: string
  componentTypes?: string[]
  originClientId?: string
}

// ---------------------------------------------------------------------------
// Run API (S3) — execute a synced pipeline handler in the isolated runner
// ---------------------------------------------------------------------------

/**
 * Handlers that may be executed in a sandbox. `deploy` and `rollback` are
 * deliberately NOT runnable in v1: they mutate external systems, while the
 * dev-loop value (fast feedback on config + connectivity + status logic)
 * comes from the read-only/validating handlers below.
 *
 * Sourced from core/pipeline-engine/types (the single source of truth that
 * mirrors @veltrixsecops/app-sdk's HANDLER_NAMES) rather than a locally
 * duplicated list, so the sandbox contract can never drift from the
 * platform-wide handler contract.
 */
export const RUNNABLE_SANDBOX_HANDLERS = RUNNABLE_HANDLER_NAMES
export type RunnableSandboxHandler = HandlerName

/** One captured console line from a sandbox run. */
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
  /** Draft canvas content to hand the handler (the CLI sends the local template/config). */
  canvas?: RunSandboxCanvasInput
  /** Optional explicit target for healthCheck/driftDetect; must be tagged "sandbox". */
  componentId?: string
}

export interface RunSandboxResponse {
  runId: string
  handler: RunnableSandboxHandler
  configTypeId: string
  ok: boolean
  /** Raw handler return value (JSON-safe), null on failure. */
  result: unknown
  error: string | null
  timedOut: boolean
  durationMs: number
  logs: SandboxRunLogLine[]
}

// ---------------------------------------------------------------------------
// JSON schemas (Swagger + response serialization)
// ---------------------------------------------------------------------------

export const sandboxSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    appId: { type: 'string' },
    status: { type: 'string', enum: [...SANDBOX_STATUSES] },
    createdById: { type: 'string', nullable: true },
    lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
    fileCount: { type: 'integer' },
    sizeBytes: { type: 'integer' },
    expiresAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const

export const sandboxListSchema = {
  type: 'array',
  items: sandboxSchema,
} as const

export const createSandboxRequestSchema = {
  type: 'object',
  required: ['name', 'appId'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH, pattern: SLUG_PATTERN },
    appId: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH, pattern: SLUG_PATTERN },
  },
} as const

export const syncManifestRequestSchema = {
  type: 'array',
  maxItems: 10000,
  items: {
    type: 'object',
    required: ['path', 'sha256', 'size'],
    properties: {
      path: { type: 'string', minLength: 1, maxLength: 1024 },
      sha256: { type: 'string', minLength: 64, maxLength: 64, pattern: '^[a-f0-9]{64}$' },
      size: { type: 'integer', minimum: 0 },
    },
  },
} as const

export const syncManifestResponseSchema = {
  type: 'object',
  properties: {
    upload: { type: 'array', items: { type: 'string' } },
    delete: { type: 'array', items: { type: 'string' } },
  },
} as const

export const syncValidationSchema = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    errors: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    manifest: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
    transpiledCount: { type: 'integer' },
  },
} as const

export const syncFilesResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: [...SANDBOX_STATUSES] },
    fileCount: { type: 'integer' },
    sizeBytes: { type: 'integer' },
    lastSyncAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    validation: syncValidationSchema,
  },
} as const

// ---------------------------------------------------------------------------
// Detail-view read APIs (S5 UI)
// ---------------------------------------------------------------------------

/**
 * Mirrors AppPageDeclaration (shared/types/app.ts). Every field must be
 * listed here or Fastify's response serialization strips it — `component`
 * in particular is required by the client-side bundle-page lookup, exactly
 * as noted at the installed-app equivalent (app-management.route.ts GET
 * /enabled).
 */
const appPageDeclarationSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    component: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string' },
    icon: { type: 'string' },
    sidebar: { type: 'boolean' },
    nav: { type: 'string' },
    parent: { type: 'string' },
    group: { type: 'string' },
    order: { type: 'number' },
    layout: { type: 'string' },
    requiresPermission: {
      type: 'object',
      nullable: true,
      properties: {
        resource: { type: 'string' },
        action: { type: 'string' },
      },
    },
  },
} as const

export const sandboxManifestSummarySchema = {
  type: 'object',
  nullable: true,
  properties: {
    appId: { type: 'string' },
    name: { type: 'string' },
    version: { type: 'string' },
    configTypes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          handlers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    client: {
      type: 'object',
      nullable: true,
      properties: {
        entry: { type: 'string', nullable: true },
        pages: { type: 'array', items: appPageDeclarationSchema },
      },
    },
    valid: { type: 'boolean' },
    errors: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
    transpiledCount: { type: 'integer' },
  },
} as const

/** GET /:id response: the base sandbox row + the live manifest summary (null when never synced). */
export const sandboxDetailSchema = {
  type: 'object',
  properties: {
    ...sandboxSchema.properties,
    manifest: sandboxManifestSummarySchema,
  },
} as const

export const sandboxFilesQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: MAX_FILES_PAGE_LIMIT, default: DEFAULT_FILES_PAGE_LIMIT },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const

export const sandboxFilesResponseSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          sha256: { type: 'string' },
          size: { type: 'integer' },
        },
      },
    },
    totalCount: { type: 'integer' },
    totalBytes: { type: 'integer' },
    limit: { type: 'integer' },
    offset: { type: 'integer' },
  },
} as const

// ---------------------------------------------------------------------------
// File read/write API schemas (S6.2)
// ---------------------------------------------------------------------------

/** Shared query for GET/DELETE …/file. `originClientId` is optional (echo-guard hint). */
export const sandboxFilePathQuerySchema = {
  type: 'object',
  required: ['path'],
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 1024 },
    originClientId: { type: 'string', maxLength: 200 },
  },
} as const

export const sandboxFileContentSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    sha256: { type: 'string' },
    size: { type: 'integer' },
    content: { type: 'string' },
    encoding: { type: 'string', enum: ['utf8', 'base64'] },
    truncated: { type: 'boolean' },
  },
} as const

export const sandboxFileWriteRequestSchema = {
  type: 'object',
  required: ['path', 'content', 'encoding'],
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 1024 },
    // Size is bounded by the route bodyLimit and re-checked (decoded) against
    // SANDBOX_MAX_BYTES in the service, so no maxLength constraint here.
    content: { type: 'string' },
    encoding: { type: 'string', enum: ['utf8', 'base64'] },
    expectedSha256: { type: 'string', minLength: 64, maxLength: 64, pattern: '^[a-f0-9]{64}$' },
    originClientId: { type: 'string', maxLength: 200 },
  },
} as const

export const sandboxFileWriteResponseSchema = {
  type: 'object',
  properties: {
    sha256: { type: 'string' },
    size: { type: 'integer' },
    validation: syncValidationSchema,
  },
} as const

export const sandboxFileDeleteResponseSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    deleted: { type: 'boolean' },
    validation: syncValidationSchema,
  },
} as const

export const addConfigTypeRequestSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    // Slug id: lowercase, digits, single hyphens; must start/end alphanumeric.
    id: { type: 'string', minLength: 2, maxLength: 64, pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$' },
    name: { type: 'string', maxLength: 128 },
    componentTypes: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 64 } },
    originClientId: { type: 'string', maxLength: 200 },
  },
} as const

export const addConfigTypeResponseSchema = {
  type: 'object',
  properties: {
    configTypeId: { type: 'string' },
    createdPaths: { type: 'array', items: { type: 'string' } },
    manifest: sandboxManifestSummarySchema,
  },
} as const

export const runSandboxRequestSchema = {
  type: 'object',
  required: ['configTypeId', 'handler'],
  properties: {
    configTypeId: { type: 'string', minLength: 1, maxLength: 128 },
    handler: { type: 'string', enum: [...RUNNABLE_SANDBOX_HANDLERS] },
    componentId: { type: 'string', format: 'uuid' },
    canvas: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 256 },
        sections: {
          type: 'array',
          maxItems: 200,
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 256 },
              fields: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  },
} as const

export const runSandboxResponseSchema = {
  type: 'object',
  properties: {
    runId: { type: 'string' },
    handler: { type: 'string', enum: [...RUNNABLE_SANDBOX_HANDLERS] },
    configTypeId: { type: 'string' },
    ok: { type: 'boolean' },
    // Untyped schema on purpose: handler return values are app-defined JSON
    // (ValidationResult / ConfigStatus / HealthCheckResult / DriftResult),
    // and an untyped field serializes verbatim instead of being stripped.
    result: {},
    error: { type: 'string', nullable: true },
    timedOut: { type: 'boolean' },
    durationMs: { type: 'integer' },
    logs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
          line: { type: 'string' },
        },
      },
    },
  },
} as const

export const sandboxIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const

export const successMessageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
} as const

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
} as const

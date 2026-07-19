// ========================================================================
// Sandbox Sync Service
//
// Implements the CLI dev-loop sync protocol:
//   1. POST /:id/sync/manifest  - client sends [{path, sha256, size}];
//      we diff against stored state and answer {upload, delete}. Files the
//      client no longer has are deleted immediately (the client declared
//      its desired state), which keeps the follow-up file upload purely
//      additive and idempotent.
//   2. PUT /:id/sync/files      - tar.gz containing only the requested
//      files; validated, extracted, server-side TypeScript transpiled with
//      esbuild (cjs), sandbox row + state updated, expiry renewed.
//
// Sync state is a JSON file (.veltrix-sync-state.json) stored INSIDE the
// sandbox directory rather than a DB column. Rationale: the filesystem is
// the source of truth for synced content, so keeping the manifest next to
// the files means state and files live and die together — deleting the
// sandbox dir (delete/expiry) removes both, and losing the volume simply
// triggers a clean full resync from the CLI. It also avoids unbounded JSON
// columns and a DB write per file-level change.
//
// SECURITY: sandboxes are tenant-supplied archives landing on shared SaaS
// infrastructure. Ingest hardening (all enforced BEFORE extraction):
//   - path traversal rejection ("..", absolute paths, drive letters/ADS)
//   - executable extension rejection (reuses app-packager's blocklist)
//   - symlink / hardlink / device tar entries rejected
//   - reserved ".veltrix*" names rejected (protects the state file)
//   - total size cap (SANDBOX_MAX_BYTES) and file-count cap (SANDBOX_MAX_FILES)
// Execution of synced code is explicitly OUT of scope here (S3): this
// module only ingests, validates, transpiles and stores.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import * as tar from 'tar'
import { transform } from 'esbuild'
import { SandboxStatus, type Sandbox } from '@prisma/client'
import prisma from '../../db'
import { loggerService } from '../logger/logger.service'
import {
  assertSafePath,
  assertNotExecutable,
} from '../../core/app-engine/app-packager'
import { parseManifest } from '../../core/app-engine/manifest-parser'
import { HANDLER_NAMES } from '../../core/pipeline-engine/types'
import type { AppManifest, AppConfigurationTypeManifest } from '../../../../shared/types/app'
import { getSandboxConfig, getSandboxDir, computeExpiresAt } from './sandbox.config'
import type {
  SyncManifestEntry,
  SyncManifestResponse,
  SyncFilesResponse,
  SyncValidationResult,
  SandboxFilesPage,
  SandboxManifestSummary,
} from './sandbox.schemas'
import { SandboxError } from './sandbox.service'
import { sandboxEvents } from './sandbox.events'
import { sandboxRegistry } from './sandbox-registry'

// ---------------------------------------------------------------------------
// Sync state file
// ---------------------------------------------------------------------------

export const SYNC_STATE_FILENAME = '.veltrix-sync-state.json'

/** Reserved server-side name prefix; clients may never sync these paths. */
const RESERVED_BASENAME_PREFIX = '.veltrix'

export interface SyncStateEntry {
  sha256: string
  size: number
}

export interface SyncState {
  files: Record<string, SyncStateEntry>
  updatedAt: string
}

export function loadSyncState(sandboxDir: string): SyncState {
  const statePath = path.join(sandboxDir, SYNC_STATE_FILENAME)
  try {
    if (fs.existsSync(statePath)) {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as SyncState
      if (parsed && typeof parsed === 'object' && parsed.files) {
        return parsed
      }
    }
  } catch (error) {
    loggerService.warn(`Corrupt sandbox sync state at ${statePath}; starting fresh:`, error)
  }
  return { files: {}, updatedAt: new Date(0).toISOString() }
}

export function saveSyncState(sandboxDir: string, state: SyncState): void {
  fs.mkdirSync(sandboxDir, { recursive: true })
  state.updatedAt = new Date().toISOString()
  fs.writeFileSync(path.join(sandboxDir, SYNC_STATE_FILENAME), JSON.stringify(state, null, 2))
}

// ---------------------------------------------------------------------------
// Path + entry validation (pure — unit tested directly)
// ---------------------------------------------------------------------------

/** Normalise to a posix-style relative path. */
export function normalizeSyncPath(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

/**
 * Throw when a client-supplied file path is not safe to place inside the
 * sandbox directory. Composes app-packager's hardening with sandbox extras.
 */
export function assertSafeSyncPath(entryPath: string): void {
  const normalized = normalizeSyncPath(entryPath)

  if (!normalized || normalized.length > 1024) {
    throw new SandboxError(`Invalid file path "${entryPath}"`, 400)
  }
  if (normalized.includes('\0')) {
    throw new SandboxError(`Security violation: null byte in path "${entryPath}"`, 400)
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes(':')) {
    // Absolute paths, drive letters and NTFS alternate data streams
    throw new SandboxError(`Security violation: absolute or device path "${entryPath}"`, 400)
  }

  try {
    assertSafePath(normalized) // ".." traversal
    assertNotExecutable(normalized) // .sh/.bat/.exe/.cmd/.ps1
  } catch (error) {
    throw new SandboxError(error instanceof Error ? error.message : String(error), 400)
  }

  const basename = normalized.split('/').pop() || ''
  if (basename.startsWith(RESERVED_BASENAME_PREFIX)) {
    throw new SandboxError(`Security violation: reserved file name "${entryPath}"`, 400)
  }
}

export interface TarEntryMeta {
  path: string
  size: number
  /** tar entry type, e.g. "File", "Directory", "SymbolicLink", "Link" */
  type: string
}

export interface TarValidationLimits {
  maxFiles: number
  maxBytes: number
}

/**
 * Validate the full entry listing of an uploaded archive BEFORE anything is
 * written to disk. Returns the set of normalised file paths that may be
 * extracted. Throws SandboxError on any violation.
 */
export function validateTarEntries(
  entries: TarEntryMeta[],
  limits: TarValidationLimits,
): Set<string> {
  const allowed = new Set<string>()
  let totalSize = 0

  for (const entry of entries) {
    if (entry.type === 'Directory') {
      // Directories are harmless once their path is safe.
      assertSafeSyncPathAllowingDirs(entry.path)
      continue
    }
    if (entry.type !== 'File') {
      // Symlinks, hardlinks, devices, FIFOs: never allowed on shared infra.
      throw new SandboxError(
        `Security violation: archive entry "${entry.path}" has forbidden type "${entry.type}"`,
        400,
      )
    }

    assertSafeSyncPath(entry.path)

    const normalized = normalizeSyncPath(entry.path)
    allowed.add(normalized)
    totalSize += entry.size

    if (allowed.size > limits.maxFiles) {
      throw new SandboxError(
        `Archive exceeds the sandbox file limit of ${limits.maxFiles} files`,
        413,
      )
    }
    if (totalSize > limits.maxBytes) {
      throw new SandboxError(
        `Archive exceeds the sandbox size limit of ${formatMb(limits.maxBytes)}`,
        413,
      )
    }
  }

  return allowed
}

/** Directory entries have no extension/basename constraints beyond safety. */
function assertSafeSyncPathAllowingDirs(entryPath: string): void {
  const normalized = normalizeSyncPath(entryPath)
  if (!normalized) return
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes(':')) {
    throw new SandboxError(`Security violation: unsafe directory path "${entryPath}"`, 400)
  }
  try {
    assertSafePath(normalized)
  } catch (error) {
    throw new SandboxError(error instanceof Error ? error.message : String(error), 400)
  }
}

// ---------------------------------------------------------------------------
// Manifest diff (pure — unit tested directly)
// ---------------------------------------------------------------------------

/**
 * Diff the client's local manifest against the stored sync state.
 *   upload: files missing on the server or whose content hash changed
 *   delete: files the server has but the client no longer does
 */
export function computeManifestDiff(
  state: SyncState,
  entries: SyncManifestEntry[],
): SyncManifestResponse {
  const clientPaths = new Map<string, SyncManifestEntry>()
  for (const entry of entries) {
    clientPaths.set(normalizeSyncPath(entry.path), entry)
  }

  const upload: string[] = []
  for (const [normalized, entry] of clientPaths) {
    const stored = state.files[normalized]
    if (!stored || stored.sha256 !== entry.sha256) {
      upload.push(normalized)
    }
  }

  const toDelete: string[] = []
  for (const storedPath of Object.keys(state.files)) {
    if (!clientPaths.has(storedPath)) {
      toDelete.push(storedPath)
    }
  }

  return { upload, delete: toDelete }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

function sha256OfFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

export function toDiskPath(sandboxDir: string, normalized: string): string {
  const abs = path.resolve(sandboxDir, ...normalized.split('/'))
  // Defence in depth: validated paths can never escape, but verify anyway.
  if (abs !== sandboxDir && !abs.startsWith(sandboxDir + path.sep)) {
    throw new SandboxError(`Security violation: path "${normalized}" escapes the sandbox`, 400)
  }
  return abs
}

/** Delete a synced file plus any server-generated transpile artifact. */
export function deleteSyncedFile(sandboxDir: string, normalized: string, state: SyncState): void {
  const abs = toDiskPath(sandboxDir, normalized)
  try {
    fs.rmSync(abs, { force: true })
  } catch (error) {
    loggerService.warn(`Failed to delete sandbox file ${abs} (non-fatal):`, error)
  }

  if (/\.tsx?$/.test(normalized)) {
    const artifact = normalized.replace(/\.tsx?$/, '.js')
    // Only remove the .js sibling when it is OUR artifact, not a synced file.
    if (!state.files[artifact]) {
      try {
        fs.rmSync(toDiskPath(sandboxDir, artifact), { force: true })
      } catch {
        // best-effort
      }
    }
  }

  delete state.files[normalized]
}

/** One server-side TS source run through esbuild, held in memory (no disk write). */
interface CompiledSource {
  path: string
  code: string | null
  error: string | null
}

/**
 * Which server-side sources are in scope for transpilation: every synced
 * .ts/.tsx file except declaration files and anything under client/ (client
 * bundling is a separate, known platform gap).
 */
function isTranspilableSource(normalized: string): boolean {
  if (!/\.tsx?$/.test(normalized)) return false
  if (normalized.endsWith('.d.ts')) return false
  if (normalized === 'client' || normalized.startsWith('client/')) return false
  return true
}

/**
 * Run esbuild over every in-scope server source WITHOUT writing anything to
 * disk. Pure/read-only, so it can be reused for both the real ingest
 * (which then writes the successful outputs) and the manifest-summary read
 * endpoint (which only needs to know the current validity/error set).
 */
async function compileServerSources(
  sandboxDir: string,
  state: SyncState,
): Promise<CompiledSource[]> {
  const results: CompiledSource[] = []

  for (const normalized of Object.keys(state.files)) {
    if (!isTranspilableSource(normalized)) continue

    const sourcePath = toDiskPath(sandboxDir, normalized)
    try {
      const source = fs.readFileSync(sourcePath, 'utf-8')
      const result = await transform(source, {
        loader: normalized.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        sourcefile: normalized,
      })
      results.push({ path: normalized, code: result.code, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ path: normalized, code: null, error: `Transpile failed for ${normalized}: ${message}` })
    }
  }

  return results
}

/**
 * Transpile server-side TypeScript sources to CommonJS with esbuild,
 * writing each successfully-compiled artifact next to its source.
 */
async function transpileServerSources(
  sandboxDir: string,
  state: SyncState,
): Promise<{ transpiledCount: number; errors: string[] }> {
  const compiled = await compileServerSources(sandboxDir, state)
  const errors: string[] = []
  let transpiledCount = 0

  for (const source of compiled) {
    if (source.error || source.code === null) {
      errors.push(source.error ?? `Transpile failed for ${source.path}: unknown error`)
      continue
    }
    const outputPath = toDiskPath(sandboxDir, source.path).replace(/\.tsx?$/, '.js')
    fs.writeFileSync(outputPath, source.code)
    transpiledCount++
  }

  return { transpiledCount, errors }
}

/** Parse and sanity-check the app manifest inside the sandbox directory. */
function validateSandboxManifest(
  sandboxDir: string,
  state: SyncState,
  expectedAppId: string,
): Pick<SyncValidationResult, 'errors' | 'warnings' | 'manifest'> & { fullManifest: AppManifest | null } {
  const errors: string[] = []
  const warnings: string[] = []
  let manifestSummary: SyncValidationResult['manifest'] = null
  let fullManifest: AppManifest | null = null

  if (!state.files['manifest.yaml']) {
    errors.push('manifest.yaml has not been synced yet — every app needs a manifest at its root')
    return { errors, warnings, manifest: manifestSummary, fullManifest }
  }

  try {
    const manifest = parseManifest(path.join(sandboxDir, 'manifest.yaml'))
    fullManifest = manifest
    manifestSummary = { id: manifest.id, name: manifest.name, version: manifest.version }
    if (manifest.id !== expectedAppId) {
      warnings.push(
        `manifest id "${manifest.id}" does not match the sandbox app "${expectedAppId}"`,
      )
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  return { errors, warnings, manifest: manifestSummary, fullManifest }
}

/** Handler slots, in declaration order, that a manifest configuration type may define. */
/** Handler names actually declared (non-empty) on a configuration type, in a stable order. */
function summarizeConfigTypeHandlers(handlers: AppConfigurationTypeManifest['handlers']): string[] {
  return HANDLER_NAMES.filter((handler) => Boolean(handlers[handler]))
}

function writeTempArchive(buffer: Buffer): string {
  const tmpPath = path.join(
    os.tmpdir(),
    `veltrix-sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`,
  )
  fs.writeFileSync(tmpPath, buffer)
  return tmpPath
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // best-effort temp cleanup
  }
}

function stateTotals(state: SyncState): { fileCount: number; sizeBytes: number } {
  const files = Object.values(state.files)
  return {
    fileCount: files.length,
    sizeBytes: files.reduce((sum, f) => sum + f.size, 0),
  }
}

// ---------------------------------------------------------------------------
// Read-only detail-view helpers (S5 UI) — sourced ENTIRELY from the trusted
// .veltrix-sync-state.json manifest state, never a raw filesystem walk, so a
// tampered/legacy state entry can never cause a path outside the sandbox dir
// to be touched. Both are pure reads; getManifestSummary additionally runs
// esbuild in memory (no disk writes) to report the CURRENT validity of the
// synced sources without waiting for another sync.
// ---------------------------------------------------------------------------

/** Paginated, sorted listing of a sandbox's synced files (path/sha256/size only). */
export function listFiles(sandbox: Sandbox, options: { limit: number; offset: number }): SandboxFilesPage {
  const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
  const state = loadSyncState(sandboxDir)

  const entries = Object.entries(state.files)
    .map(([filePath, meta]) => ({ path: filePath, sha256: meta.sha256, size: meta.size }))
    .sort((a, b) => a.path.localeCompare(b.path))

  const totalCount = entries.length
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0)
  const { limit, offset } = options

  return {
    files: entries.slice(offset, offset + limit),
    totalCount,
    totalBytes,
    limit,
    offset,
  }
}

/**
 * Manifest + validation summary for the sandbox detail view. Returns null
 * when the sandbox has never completed a sync (nothing to summarize yet —
 * the UI shows its own "not synced" empty state for that case). Re-parses
 * the manifest and re-runs esbuild (in memory only, nothing is written) so
 * the result always reflects the CURRENT on-disk sources rather than a
 * stale snapshot from whenever the last sync happened to run.
 */
export async function getManifestSummary(sandbox: Sandbox): Promise<SandboxManifestSummary | null> {
  if (!sandbox.lastSyncAt) return null

  const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
  const state = loadSyncState(sandboxDir)

  const compiled = await compileServerSources(sandboxDir, state)
  const transpiledCount = compiled.filter((source) => !source.error).length
  const transpileErrors = compiled
    .filter((source): source is CompiledSource & { error: string } => Boolean(source.error))
    .map((source) => source.error)

  const manifestResult = validateSandboxManifest(sandboxDir, state, sandbox.appId)
  const errors = [...manifestResult.errors, ...transpileErrors]

  if (!manifestResult.fullManifest) {
    return {
      appId: sandbox.appId,
      name: sandbox.appId,
      version: '',
      configTypes: [],
      client: null,
      valid: false,
      errors,
      warnings: manifestResult.warnings,
      transpiledCount,
    }
  }

  const manifest = manifestResult.fullManifest
  return {
    appId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    configTypes: manifest.pipeline.configurationTypes.map((ct) => ({
      id: ct.id,
      name: ct.name,
      handlers: summarizeConfigTypeHandlers(ct.handlers),
    })),
    // S6.5: the portal's Preview surface needs the declared pages (nav
    // contract) to build its page switcher/tabs — see sandbox-client-bundle.ts
    // for the bundle itself and shared/types/app.ts for the contract.
    client: manifest.client
      ? { entry: manifest.client.entry ?? null, pages: manifest.client.pages ?? [] }
      : null,
    valid: errors.length === 0,
    errors,
    warnings: manifestResult.warnings,
    transpiledCount,
  }
}

// ---------------------------------------------------------------------------
// Shared finalize: (re)validate + transpile + registry + row update
//
// The single place that turns "the files on disk right now" into a validated,
// runnable sandbox. Used by BOTH the tar-delta ingest (PUT /sync/files) and
// the single-file editor mutations (PUT/DELETE /file), so the two write paths
// can never diverge: they always transpile the same server sources, run the
// same manifest validation, hot-reload the same per-tenant registry (so /run
// picks up the change) and renew the TTL identically.
// ---------------------------------------------------------------------------

export interface RevalidateResult {
  validation: SyncValidationResult
  status: SandboxStatus
  totals: { fileCount: number; sizeBytes: number }
  lastSyncAt: Date
  expiresAt: Date
}

export async function revalidateAndPersist(
  sandbox: Sandbox,
  sandboxDir: string,
  state: SyncState,
): Promise<RevalidateResult> {
  // Validate manifest + transpile server-side TypeScript (writes artifacts).
  const manifestResult = validateSandboxManifest(sandboxDir, state, sandbox.appId)
  const transpileResult = await transpileServerSources(sandboxDir, state)

  const validation: SyncValidationResult = {
    valid: manifestResult.errors.length === 0 && transpileResult.errors.length === 0,
    errors: [...manifestResult.errors, ...transpileResult.errors],
    warnings: manifestResult.warnings,
    manifest: manifestResult.manifest,
    transpiledCount: transpileResult.transpiledCount,
  }

  // Hot-reload the per-tenant registry so /run resolves the freshly written
  // handler artifacts. Invalid state deregisters the app (stale handlers must
  // not stay runnable after a broken edit).
  if (validation.valid) {
    try {
      sandboxRegistry.reload(sandbox.customerId, sandbox.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      validation.warnings.push(`Sandbox registry reload failed: ${message}`)
      loggerService.warn(`Sandbox registry reload failed for ${sandbox.id}:`, error)
    }
  } else {
    sandboxRegistry.remove(sandbox.customerId, sandbox.id)
  }

  const totals = stateTotals(state)
  const now = new Date()
  const finalStatus = validation.valid ? SandboxStatus.ACTIVE : SandboxStatus.ERROR
  const updated = await prisma.sandbox.update({
    where: { id: sandbox.id },
    data: {
      status: finalStatus,
      lastSyncAt: now,
      fileCount: totals.fileCount,
      sizeBytes: totals.sizeBytes,
      expiresAt: computeExpiresAt(now), // every successful mutation renews the TTL
    },
  })

  return { validation, status: finalStatus, totals, lastSyncAt: now, expiresAt: updated.expiresAt }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const syncService = {
  /**
   * Handle a manifest POST: validate the client manifest, diff against
   * stored state, delete files the client no longer has, renew the TTL and
   * answer which files must be uploaded.
   */
  async applyManifest(
    sandbox: Sandbox,
    entries: SyncManifestEntry[],
  ): Promise<SyncManifestResponse> {
    const { maxFiles, maxBytes } = getSandboxConfig()

    if (entries.length > maxFiles) {
      throw new SandboxError(`Manifest exceeds the sandbox file limit of ${maxFiles} files`, 413)
    }
    let declaredSize = 0
    for (const entry of entries) {
      assertSafeSyncPath(entry.path)
      declaredSize += entry.size
    }
    if (declaredSize > maxBytes) {
      throw new SandboxError(`Manifest exceeds the sandbox size limit of ${formatMb(maxBytes)}`, 413)
    }

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
    const state = loadSyncState(sandboxDir)
    const diff = computeManifestDiff(state, entries)

    // Deletions apply immediately: the client declared these gone locally.
    for (const staleFile of diff.delete) {
      deleteSyncedFile(sandboxDir, staleFile, state)
    }
    saveSyncState(sandboxDir, state)

    const totals = stateTotals(state)
    await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: {
        fileCount: totals.fileCount,
        sizeBytes: totals.sizeBytes,
        expiresAt: computeExpiresAt(), // every successful sync renews the TTL
      },
    })

    loggerService.info(
      `Sandbox manifest diff for ${sandbox.id}: upload=${diff.upload.length} delete=${diff.delete.length}`,
    )

    return diff
  },

  /**
   * Handle a files PUT: validate + extract the tar.gz delta, refresh sync
   * state, run manifest validation + esbuild transpile, update the sandbox
   * row and emit the realtime sync event.
   */
  async ingestFiles(sandbox: Sandbox, archive: Buffer): Promise<SyncFilesResponse> {
    const { maxBytes, maxFiles } = getSandboxConfig()

    if (archive.byteLength === 0) {
      throw new SandboxError('Empty archive body', 400)
    }
    if (archive.byteLength > maxBytes) {
      throw new SandboxError(
        `Archive exceeds the sandbox size limit of ${formatMb(maxBytes)}`,
        413,
      )
    }

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)

    await prisma.sandbox.update({
      where: { id: sandbox.id },
      data: { status: SandboxStatus.SYNCING },
    })
    sandboxEvents.emitStatus(sandbox.customerId, {
      sandboxId: sandbox.id,
      name: sandbox.name,
      status: 'SYNCING',
    })

    const tmpArchive = writeTempArchive(archive)
    try {
      // Pass 1: list + validate every entry BEFORE writing anything.
      const entries: TarEntryMeta[] = []
      await tar.list({
        file: tmpArchive,
        onReadEntry: (entry) => {
          entries.push({
            path: String(entry.path),
            size: entry.size ?? 0,
            type: String(entry.type),
          })
        },
      })

      const allowedPaths = validateTarEntries(entries, { maxFiles, maxBytes })
      if (allowedPaths.size === 0) {
        throw new SandboxError('Archive contains no files', 400)
      }

      // Enforce caps on the RESULTING sandbox (existing state + new files).
      const state = loadSyncState(sandboxDir)
      const projected = { ...state.files }
      for (const entry of entries) {
        if (entry.type !== 'File') continue
        projected[normalizeSyncPath(entry.path)] = { sha256: '', size: entry.size }
      }
      const projectedFiles = Object.keys(projected).length
      const projectedBytes = Object.values(projected).reduce((sum, f) => sum + f.size, 0)
      if (projectedFiles > maxFiles) {
        throw new SandboxError(`Sandbox would exceed the file limit of ${maxFiles} files`, 413)
      }
      if (projectedBytes > maxBytes) {
        throw new SandboxError(`Sandbox would exceed the size limit of ${formatMb(maxBytes)}`, 413)
      }

      // Pass 2: extract only the validated entries.
      fs.mkdirSync(sandboxDir, { recursive: true })
      await tar.extract({
        file: tmpArchive,
        cwd: sandboxDir,
        filter: (entryPath, entry) => {
          const entryType = 'type' in entry ? String(entry.type) : ''
          return entryType === 'Directory' || allowedPaths.has(normalizeSyncPath(entryPath))
        },
      })

      // Record extracted files with server-computed hashes (authoritative).
      for (const normalized of allowedPaths) {
        const diskPath = toDiskPath(sandboxDir, normalized)
        if (!fs.existsSync(diskPath)) continue
        state.files[normalized] = {
          sha256: sha256OfFile(diskPath),
          size: fs.statSync(diskPath).size,
        }
      }
      saveSyncState(sandboxDir, state)

      // Validate manifest + transpile + registry reload + row update (shared
      // with the single-file editor write path so the two never diverge).
      const { validation, status: finalStatus, totals, lastSyncAt, expiresAt } =
        await revalidateAndPersist(sandbox, sandboxDir, state)

      const response: SyncFilesResponse = {
        status: finalStatus,
        fileCount: totals.fileCount,
        sizeBytes: totals.sizeBytes,
        lastSyncAt,
        expiresAt,
        validation,
      }

      sandboxEvents.emitSynced(sandbox.customerId, {
        sandboxId: sandbox.id,
        name: sandbox.name,
        appId: sandbox.appId,
        status: finalStatus,
        fileCount: totals.fileCount,
        sizeBytes: totals.sizeBytes,
        validation,
      })

      loggerService.info(
        `Sandbox sync ingested for ${sandbox.id}: ${allowedPaths.size} files, valid=${validation.valid}`,
      )

      return response
    } catch (error) {
      // Mark the sandbox errored so the UI/CLI reflect the failed sync.
      await prisma.sandbox
        .update({ where: { id: sandbox.id }, data: { status: SandboxStatus.ERROR } })
        .catch((updateError: unknown) => {
          loggerService.warn('Failed to mark sandbox ERROR after ingest failure:', updateError)
        })
      sandboxEvents.emitStatus(sandbox.customerId, {
        sandboxId: sandbox.id,
        name: sandbox.name,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Sync failed',
      })
      throw error
    } finally {
      safeUnlink(tmpArchive)
    }
  },
}

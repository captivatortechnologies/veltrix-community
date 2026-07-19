// ========================================================================
// Sandbox File Service (S6.2)
//
// Single-file read/write/delete over a sandbox's synced content, powering the
// in-browser editor (and, symmetrically, the CLI's reverse sync). The sandbox
// is the source of truth; both the portal and the CLI are peers writing to it,
// each edit hash-stamped so neither echoes its own change back.
//
// SECURITY: the editor widens the write surface, so EVERY write reuses the
// exact tar-ingest hardening (sync.service):
//   - assertSafeSyncPath: path containment ("..", absolute, drive letter,
//     NTFS ADS, null byte), executable-extension blocklist, reserved
//     ".veltrix*" names (protects the sync-state file)
//   - per-write size cap and resulting-sandbox size/file-count caps
//     (SANDBOX_MAX_BYTES / SANDBOX_MAX_FILES)
//   - transpile output confined to the sandbox dir (toDiskPath containment)
// Reads are sourced from the trusted .veltrix-sync-state.json manifest (never a
// raw filesystem walk), so only files the sandbox actually tracks are served.
//
// Every successful mutation runs the shared revalidateAndPersist finalize
// (transpile server sources + re-validate manifest + hot-reload the runner
// registry + renew TTL), then emits sandbox:file-changed + sandbox:validation
// to the owning customer's tenant room.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { Sandbox } from '@prisma/client'
import { getSandboxConfig, getSandboxDir } from './sandbox.config'
import { SandboxError } from './sandbox.service'
import { sandboxEvents, type SandboxFileOrigin } from './sandbox.events'
import {
  normalizeSyncPath,
  assertSafeSyncPath,
  loadSyncState,
  saveSyncState,
  toDiskPath,
  deleteSyncedFile,
  revalidateAndPersist,
} from './sync.service'
import type {
  SandboxFileContent,
  SandboxFileWriteRequest,
  SandboxFileWriteResult,
  SandboxFileDeleteResult,
} from './sandbox.schemas'

/** Text payloads are capped at 256 KB; larger/binary content is returned base64 (and/or truncated). */
export const FILE_TEXT_MAX_BYTES = 256 * 1024

/** Context the caller supplies so file-changed events can be echo-guarded by peers. */
export interface FileMutationOrigin {
  origin: SandboxFileOrigin
  originClientId?: string | null
}

function sha256OfBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Heuristic binary sniff: a NUL byte in the leading window is a reliable
 * indicator of non-text content (all our real sources are UTF-8 text).
 */
function isProbablyBinary(buffer: Buffer): boolean {
  const window = buffer.subarray(0, Math.min(buffer.byteLength, 8000))
  return window.includes(0)
}

function projectedTotals(
  state: ReturnType<typeof loadSyncState>,
  normalized: string,
  newSize: number,
): { fileCount: number; sizeBytes: number } {
  const projected: Record<string, { size: number }> = { ...state.files }
  projected[normalized] = { size: newSize }
  const entries = Object.values(projected)
  return {
    fileCount: entries.length,
    sizeBytes: entries.reduce((sum, f) => sum + f.size, 0),
  }
}

export const fileService = {
  /**
   * Read one synced file. Only files recorded in the sync state are served
   * (never an arbitrary filesystem read). Text ≤256 KB is returned as UTF-8;
   * larger text is truncated; binary content is returned base64.
   */
  readFile(sandbox: Sandbox, relPath: string): SandboxFileContent {
    assertSafeSyncPath(relPath)
    const normalized = normalizeSyncPath(relPath)

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
    const state = loadSyncState(sandboxDir)
    if (!state.files[normalized]) {
      throw new SandboxError(`File "${normalized}" is not present in this sandbox`, 404)
    }

    const abs = toDiskPath(sandboxDir, normalized)
    if (!fs.existsSync(abs)) {
      throw new SandboxError(`File "${normalized}" is not present in this sandbox`, 404)
    }

    const buffer = fs.readFileSync(abs)
    const sha256 = sha256OfBuffer(buffer)
    const size = buffer.byteLength
    const binary = isProbablyBinary(buffer)
    const truncated = size > FILE_TEXT_MAX_BYTES
    const slice = truncated ? buffer.subarray(0, FILE_TEXT_MAX_BYTES) : buffer

    return {
      path: normalized,
      sha256,
      size,
      content: binary ? slice.toString('base64') : slice.toString('utf8'),
      encoding: binary ? 'base64' : 'utf8',
      truncated,
    }
  },

  /**
   * Create or overwrite one file. Enforces the ingest hardening + caps, honors
   * optimistic concurrency (409 on a stale expectedSha256), then re-validates
   * and hot-reloads the sandbox so a subsequent /run executes the new code.
   */
  async writeFile(
    sandbox: Sandbox,
    input: SandboxFileWriteRequest,
    mutation: FileMutationOrigin,
  ): Promise<SandboxFileWriteResult> {
    assertSafeSyncPath(input.path)
    const normalized = normalizeSyncPath(input.path)
    const { maxBytes, maxFiles } = getSandboxConfig()

    const buffer =
      input.encoding === 'base64'
        ? Buffer.from(input.content, 'base64')
        : Buffer.from(input.content, 'utf8')
    const size = buffer.byteLength

    // Per-write cap.
    if (size > maxBytes) {
      throw new SandboxError(
        `File exceeds the per-file sandbox size limit of ${Math.floor(maxBytes / (1024 * 1024))} MB`,
        413,
      )
    }

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
    const state = loadSyncState(sandboxDir)
    const stored = state.files[normalized]
    const previousSha256 = stored?.sha256 ?? null

    // Optimistic concurrency: the client tells us the version it edited; if the
    // sandbox moved on (another peer wrote, or the file no longer exists), 409.
    if (input.expectedSha256 !== undefined) {
      if (!stored || stored.sha256 !== input.expectedSha256) {
        throw new SandboxError(
          'File changed on disk since it was read (expectedSha256 mismatch) — reload or overwrite',
          409,
        )
      }
    }

    // Resulting-sandbox caps (existing state with this file replaced/added).
    const projected = projectedTotals(state, normalized, size)
    if (projected.fileCount > maxFiles) {
      throw new SandboxError(`Sandbox would exceed the file limit of ${maxFiles} files`, 413)
    }
    if (projected.sizeBytes > maxBytes) {
      throw new SandboxError(
        `Sandbox would exceed the size limit of ${Math.floor(maxBytes / (1024 * 1024))} MB`,
        413,
      )
    }

    // Write the file (server-computed hash is authoritative).
    const abs = toDiskPath(sandboxDir, normalized)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, buffer)
    const sha256 = sha256OfBuffer(buffer)

    state.files[normalized] = { sha256, size }
    saveSyncState(sandboxDir, state)

    // Re-transpile server sources (incl. this .ts/.tsx, skipping client/),
    // re-validate the manifest, hot-reload the registry and renew the TTL.
    const { validation } = await revalidateAndPersist(sandbox, sandboxDir, state)

    sandboxEvents.emitFileChanged(sandbox.customerId, {
      sandboxId: sandbox.id,
      path: normalized,
      sha256,
      previousSha256,
      size,
      origin: mutation.origin,
      originClientId: mutation.originClientId ?? null,
    })
    sandboxEvents.emitValidation(sandbox.customerId, {
      sandboxId: sandbox.id,
      path: normalized,
      validation,
    })

    return { sha256, size, validation }
  },

  /**
   * Delete one synced file and its transpiled artifact, then re-validate the
   * sandbox. Emits a file-changed event with an empty sha256 (the deletion
   * marker) so peers can drop their local copy.
   */
  async deleteFile(
    sandbox: Sandbox,
    relPath: string,
    mutation: FileMutationOrigin,
  ): Promise<SandboxFileDeleteResult> {
    assertSafeSyncPath(relPath)
    const normalized = normalizeSyncPath(relPath)

    const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
    const state = loadSyncState(sandboxDir)
    const stored = state.files[normalized]
    if (!stored) {
      throw new SandboxError(`File "${normalized}" is not present in this sandbox`, 404)
    }
    const previousSha256 = stored.sha256

    // Removes the file, its transpiled .js artifact, and the state entry.
    deleteSyncedFile(sandboxDir, normalized, state)
    saveSyncState(sandboxDir, state)

    const { validation } = await revalidateAndPersist(sandbox, sandboxDir, state)

    sandboxEvents.emitFileChanged(sandbox.customerId, {
      sandboxId: sandbox.id,
      path: normalized,
      sha256: '', // deletion marker
      previousSha256,
      size: 0,
      origin: mutation.origin,
      originClientId: mutation.originClientId ?? null,
    })
    sandboxEvents.emitValidation(sandbox.customerId, {
      sandboxId: sandbox.id,
      path: normalized,
      validation,
    })

    return { path: normalized, deleted: true, validation }
  },
}

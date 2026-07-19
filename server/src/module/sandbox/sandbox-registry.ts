// ========================================================================
// Sandbox Registry
//
// Per-tenant registry of synced sandbox apps, keyed by (customerId,
// sandboxId). This is deliberately SEPARATE from the global AppRegistry:
//
//   - entries are never merged into the platform app registry, so sandbox
//     apps are invisible to other tenants, to regular pipeline runs and to
//     schedulers (drift/health loops resolve handlers via AppRegistry only)
//   - this registry NEVER require()s sandbox code. It only parses the
//     synced manifest and records WHERE the transpiled handler artifacts
//     live on disk; execution happens exclusively in the child-process
//     sandbox runner (see runner/), so tenant code never loads into the
//     main server process.
//
// Entries are (re)loaded after every successful sync (sync.service hook),
// lazily on first /run after a server restart, and removed on sandbox
// delete/expiry.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import type { AppManifest } from '../../../../shared/types/app'
import { parseManifest } from '../../core/app-engine/manifest-parser'
import { loggerService } from '../logger/logger.service'
import { getSandboxDir } from './sandbox.config'
import { HANDLER_NAMES, type HandlerName } from '../../core/pipeline-engine/types'

/**
 * All handler slots a manifest configuration type can declare. Re-exported
 * under the sandbox module's own name for readability at call sites, but
 * sourced from core/pipeline-engine/types (the single source of truth that
 * mirrors @veltrixsecops/app-sdk's HANDLER_NAMES) rather than duplicated
 * here — never hardcode the handler contract in more than one place.
 */
export type SandboxHandlerName = HandlerName

export interface SandboxConfigTypeEntry {
  configTypeId: string
  name: string
  /** Component types this config type targets (from manifest targets). */
  componentTypes: string[]
  /**
   * Absolute paths to the transpiled .js artifacts inside the sandbox dir,
   * for every declared handler whose artifact exists on disk.
   */
  handlerArtifacts: Partial<Record<SandboxHandlerName, string>>
  /** Handlers declared in the manifest whose artifact is missing/unsafe. */
  missingHandlers: SandboxHandlerName[]
}

export interface RegisteredSandboxApp {
  customerId: string
  sandboxId: string
  appId: string
  dir: string
  manifest: AppManifest
  configTypes: Map<string, SandboxConfigTypeEntry>
  loadedAt: Date
}

/**
 * Map a manifest handler source path to its transpiled artifact inside the
 * sandbox directory. Returns null when the path escapes the sandbox dir or
 * no candidate artifact exists.
 *
 * Handler paths in manifest.yaml may be declared three ways (all valid per
 * the app-SDK convention — see app-registry.ts's loadApp, which loads the
 * SAME manifest shape for installed/production apps via `require()`):
 *   - with a .ts/.tsx extension  -> sync ingest transpiles to a sibling .js
 *   - with a literal .js extension -> used as-is
 *   - with NO extension at all (the common convention, e.g.
 *     "config-types/indexes/validate") -> production relies on Node's
 *     require() to auto-resolve ".js"; this registry deliberately never
 *     require()s sandbox code (see module docblock), so it must replicate
 *     that resolution explicitly by trying "<path>.js" first.
 */
function resolveHandlerArtifact(sandboxDir: string, sourcePath: string): string | null {
  const normalized = sourcePath.replace(/\\/g, '/').replace(/^\.\//, '')

  let candidates: string[]
  if (/\.tsx?$/.test(normalized)) {
    candidates = [normalized.replace(/\.tsx?$/, '.js')]
  } else if (normalized.endsWith('.js')) {
    candidates = [normalized]
  } else {
    candidates = [`${normalized}.js`, normalized]
  }

  for (const candidate of candidates) {
    const abs = path.resolve(sandboxDir, ...candidate.split('/'))
    if (abs !== sandboxDir && !abs.startsWith(sandboxDir + path.sep)) {
      // Containment breach — the sync ingest should make this impossible, but
      // the manifest is tenant-supplied so verify anyway.
      loggerService.warn(
        `Sandbox registry: handler path "${sourcePath}" escapes the sandbox directory; ignoring`,
      )
      return null
    }
    if (fs.existsSync(abs)) return abs
  }
  return null
}

export class SandboxRegistry {
  /** Keyed by `${customerId}:${sandboxId}` — tenancy is part of the key. */
  private apps = new Map<string, RegisteredSandboxApp>()

  private key(customerId: string, sandboxId: string): string {
    return `${customerId}:${sandboxId}`
  }

  /**
   * Parse the synced manifest and (re)register the sandbox app. Throws a
   * plain Error when the manifest is missing or invalid (callers map it to
   * their own error type). Never loads any sandbox code.
   */
  reload(customerId: string, sandboxId: string): RegisteredSandboxApp {
    const dir = getSandboxDir(customerId, sandboxId)
    const manifest = parseManifest(path.join(dir, 'manifest.yaml'))

    const configTypes = new Map<string, SandboxConfigTypeEntry>()
    for (const ct of manifest.pipeline.configurationTypes) {
      const handlerArtifacts: Partial<Record<SandboxHandlerName, string>> = {}
      const missingHandlers: SandboxHandlerName[] = []

      for (const handlerName of HANDLER_NAMES) {
        const sourcePath = ct.handlers[handlerName]
        if (!sourcePath) continue // optional handler (driftDetect) not declared
        const artifact = resolveHandlerArtifact(dir, sourcePath)
        if (artifact) {
          handlerArtifacts[handlerName] = artifact
        } else {
          missingHandlers.push(handlerName)
        }
      }

      configTypes.set(ct.id, {
        configTypeId: ct.id,
        name: ct.name,
        componentTypes: ct.targets.componentTypes,
        handlerArtifacts,
        missingHandlers,
      })
    }

    const entry: RegisteredSandboxApp = {
      customerId,
      sandboxId,
      appId: manifest.id,
      dir,
      manifest,
      configTypes,
      loadedAt: new Date(),
    }
    this.apps.set(this.key(customerId, sandboxId), entry)

    loggerService.info(
      `Sandbox registry: loaded ${manifest.id} for sandbox ${sandboxId} ` +
        `(${configTypes.size} config type(s))`,
    )
    return entry
  }

  /**
   * Fetch a registered sandbox app. The customerId is part of the lookup
   * key, so one tenant can never resolve another tenant's sandbox.
   */
  get(customerId: string, sandboxId: string): RegisteredSandboxApp | undefined {
    return this.apps.get(this.key(customerId, sandboxId))
  }

  /**
   * Get the entry, lazily reloading from disk when absent (e.g. after a
   * server restart, when synced files still exist on the volume).
   */
  ensureLoaded(customerId: string, sandboxId: string): RegisteredSandboxApp {
    return this.get(customerId, sandboxId) ?? this.reload(customerId, sandboxId)
  }

  remove(customerId: string, sandboxId: string): void {
    if (this.apps.delete(this.key(customerId, sandboxId))) {
      loggerService.info(`Sandbox registry: removed sandbox ${sandboxId}`)
    }
  }

  listForCustomer(customerId: string): RegisteredSandboxApp[] {
    return Array.from(this.apps.values()).filter((app) => app.customerId === customerId)
  }

  /** Test helper / kill-switch support. */
  clear(): void {
    this.apps.clear()
  }

  get size(): number {
    return this.apps.size
  }
}

/** Singleton — sandbox apps live in server memory alongside their files. */
export const sandboxRegistry = new SandboxRegistry()

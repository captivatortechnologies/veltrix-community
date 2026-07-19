// ========================================================================
// Sandbox Client Bundle (S6.5)
//
// Bundles a synced sandbox app's client entry into a browser ESM module so
// the portal's Preview surface can run the developer's work-in-progress UI
// inside its own sandbox, the same way an installed app's pages render
// inside the host chrome (see core/app-engine/app-client-bundle.route.ts).
//
// CRITICAL DIFFERENCE from the installed-app bundle route: sandbox code is
// TENANT-PRIVATE, unreleased work — never public marketplace code. This
// module is only ever reached through GET /:id/client.mjs, which the route
// registers behind the SAME authenticated + tenant-scoped preHandler
// (`sandbox:read`) as every other sandbox endpoint (see sandbox.route.ts).
// A browser `import()`/<script> cannot attach the platform's Authorization
// header, so the portal fetches this module's TEXT with its authenticated
// fetch and loads it via `URL.createObjectURL(new Blob([...]))` rather than
// a bare `import(url)` — see client/src/pages/sandboxes/previewBundle.ts.
//
// Resolution: the synced manifest's `client.entry` (extensionless by
// convention, e.g. "client/index" -> "client/index.tsx"), esbuild-bundled
// on demand with the SAME host-runtime shims the installed-app bundle route
// uses (hostRuntimeShimPlugin, reused — not duplicated), so sandbox pages
// share exactly one React instance with the host, exactly like installed
// apps do.
//
// Caching: keyed by (customerId, sandboxId), invalidated by the newest
// mtime under the sandbox's `client/` directory — so a portal editor save
// (file.service.writeFile) or a CLI sync (sync.service.ingestFiles) busts
// the cache automatically, with no explicit cross-module wiring required
// (mirrors the installed-app bundle route's on-demand cache).
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { build } from 'esbuild'
import type { Sandbox } from '@prisma/client'
import { hostRuntimeShimPlugin } from '../../core/app-engine/app-client-bundle.route'
import { resolveClientEntryFile } from '../../core/app-engine/client-entry-resolver'
import { parseManifest } from '../../core/app-engine/manifest-parser'
import { getSandboxConfig, getSandboxDir } from './sandbox.config'
import { SandboxError } from './sandbox.service'
import { loggerService } from '../logger/logger.service'

/** The error every "nothing to bundle" branch throws — one message, one shape. */
const NO_CLIENT_BUNDLE_ERROR = 'Sandbox app has no client bundle'

interface CachedSandboxBundle {
  mtimeMs: number
  code: string
}

/** Keyed by `${customerId}:${sandboxId}` — tenancy is part of the cache key. */
const bundleCache = new Map<string, CachedSandboxBundle>()

function cacheKey(customerId: string, sandboxId: string): string {
  return `${customerId}:${sandboxId}`
}

/** Test hook: reset the in-memory on-demand build cache. */
export function clearSandboxClientBundleCache(): void {
  bundleCache.clear()
}

/** Newest mtime (ms) of any file/directory under `dir`; 0 when unreadable/missing. */
function latestMtimeMs(dir: string): number {
  let latest = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      try {
        latest = Math.max(latest, fs.statSync(full).mtimeMs)
      } catch {
        continue
      }
      if (entry.isDirectory()) stack.push(full)
    }
  }
  return latest
}

/**
 * Resolve + bundle a sandbox's client entry, esbuild-cached by the newest
 * mtime under its `client/` directory. Throws SandboxError:
 *   - 404 when the sandbox has never synced, has no manifest, declares no
 *     `client.entry`, the entry does not resolve to a real file, or the
 *     entry path would escape the sandbox directory (tenant-supplied text)
 *   - 413 when the built output exceeds SANDBOX_MAX_BYTES
 * esbuild failures (a genuine syntax error in the developer's own source)
 * propagate as a plain Error for the controller to map to a 500 — the same
 * "app is broken" outcome the CLI's local bundler would hit.
 */
export async function getSandboxClientBundle(sandbox: Sandbox): Promise<string> {
  const sandboxDir = getSandboxDir(sandbox.customerId, sandbox.id)
  const manifestPath = path.join(sandboxDir, 'manifest.yaml')

  if (!sandbox.lastSyncAt || !fs.existsSync(manifestPath)) {
    throw new SandboxError(NO_CLIENT_BUNDLE_ERROR, 404)
  }

  let entryRel: string | undefined
  try {
    entryRel = parseManifest(manifestPath).client?.entry
  } catch (error) {
    loggerService.warn(`Sandbox client bundle: manifest failed to parse for ${sandbox.id}:`, error)
    throw new SandboxError(NO_CLIENT_BUNDLE_ERROR, 404)
  }

  if (!entryRel) {
    throw new SandboxError(NO_CLIENT_BUNDLE_ERROR, 404)
  }

  const entryPath = path.resolve(sandboxDir, entryRel)
  // Defence in depth: the manifest is tenant-supplied text; a client.entry
  // may never point outside its own sandbox directory (mirrors the
  // installed-app bundle route's identical appRoot containment check).
  if (entryPath !== sandboxDir && !entryPath.startsWith(sandboxDir + path.sep)) {
    throw new SandboxError(NO_CLIENT_BUNDLE_ERROR, 404)
  }

  const resolvedEntry = resolveClientEntryFile(entryPath)
  if (!resolvedEntry) {
    throw new SandboxError(NO_CLIENT_BUNDLE_ERROR, 404)
  }

  const clientDir = path.join(sandboxDir, 'client')
  const watchedDir = fs.existsSync(clientDir) ? clientDir : path.dirname(resolvedEntry)
  const mtimeMs = latestMtimeMs(watchedDir)

  const key = cacheKey(sandbox.customerId, sandbox.id)
  const cached = bundleCache.get(key)
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.code
  }

  const result = await build({
    entryPoints: [resolvedEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    target: 'es2020',
    write: false,
    minify: false,
    logLevel: 'silent',
    absWorkingDir: sandboxDir,
    plugins: [hostRuntimeShimPlugin()],
  })

  const code = result.outputFiles[0]?.text ?? ''

  const { maxBytes } = getSandboxConfig()
  if (Buffer.byteLength(code, 'utf8') > maxBytes) {
    throw new SandboxError(
      `Sandbox client bundle exceeds the sandbox size limit of ${Math.floor(maxBytes / (1024 * 1024))} MB`,
      413,
    )
  }

  bundleCache.set(key, { mtimeMs, code })
  return code
}

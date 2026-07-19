// ========================================================================
// App Client Bundle Route
//
// GET /api/apps/:appId/client.mjs — serves an installed app's client-side
// page bundle as a browser ESM module so the SPA can dynamically
// `import()` it (see client/src/pages/apps/AppPageHost.tsx).
//
// Resolution order per app:
//   1. Prebuilt bundle shipped in the package: <appDir>/client/dist/index.mjs
//   2. On-demand esbuild bundle of the manifest's `client.entry` source,
//      cached in memory and invalidated when anything under <appDir>/client
//      changes on disk.
//   3. 404 { error: 'App has no client bundle' }
//
// AUTH: intentionally NO verifyToken. Browser `import()`/<script> loads
// cannot attach the platform's Authorization: Bearer header, and app client
// bundles are public marketplace code (the same code anyone can download
// from the marketplace — never secrets). Everything the loaded pages *do*
// still goes through bearer-protected APIs via the host's authFetch.
//
// The react/* and @veltrixsecops/app-sdk/* imports inside app sources are
// compile-time replaced with shims that read the host-installed global
// `globalThis.__VELTRIX_APP_RUNTIME__` (see the SDK's client runtime
// contract), guaranteeing a single React instance per page.
// ========================================================================

import * as fs from 'fs'
import * as path from 'path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { build, Plugin } from 'esbuild'
import { loggerService } from '../../module/logger/logger.service'
import { getAppRegistry } from '../platform-bootstrap'
import { resolveClientEntryFile } from './client-entry-resolver'

/** Same shape the app packager enforces for app ids; also blocks traversal. */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

/** Name of the global the host SPA installs before importing app bundles. */
const HOST_RUNTIME_GLOBAL = '__VELTRIX_APP_RUNTIME__'

/**
 * Import specifiers that must never be bundled from node_modules — each is
 * replaced with a shim reading the corresponding property off the host
 * runtime global. Keys are EXACT specifiers (no prefix matching).
 */
const RUNTIME_SHIM_PROPS: Record<string, string> = {
  react: 'react',
  'react-dom': 'reactDom',
  'react-dom/client': 'reactDomClient',
  'react/jsx-runtime': 'jsxRuntime',
  'react/jsx-dev-runtime': 'jsxRuntime',
  '@veltrixsecops/app-sdk': 'sdk',
  '@veltrixsecops/app-sdk/hooks': 'sdk',
  '@veltrixsecops/app-sdk/client': 'sdk',
  '@veltrixsecops/app-sdk/ui': 'ui',
}

/**
 * CJS shim body for one runtime property. esbuild interops `module.exports`
 * so both default and named imports of the shimmed specifier work.
 */
function shimSource(runtimeProp: string): string {
  return [
    `const rt = globalThis.${HOST_RUNTIME_GLOBAL};`,
    `if (!rt) throw new Error('Veltrix host runtime not found — app client bundles only run inside the Veltrix platform');`,
    `module.exports = rt.${runtimeProp};`,
  ].join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** esbuild plugin that redirects host-owned specifiers to runtime shims. */
export function hostRuntimeShimPlugin(): Plugin {
  const filter = new RegExp(
    `^(?:${Object.keys(RUNTIME_SHIM_PROPS).map(escapeRegExp).join('|')})$`,
  )
  return {
    name: 'veltrix-host-runtime-shim',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'veltrix-host-runtime',
      }))
      pluginBuild.onLoad({ filter: /.*/, namespace: 'veltrix-host-runtime' }, (args) => ({
        contents: shimSource(RUNTIME_SHIM_PROPS[args.path]),
        loader: 'js',
      }))
    },
  }
}

// ---------------------------------------------------------------------------
// On-demand build cache: appId -> { latest mtime under <appDir>/client, code }
// ---------------------------------------------------------------------------

interface CachedBundle {
  mtimeMs: number
  code: string
}

const onDemandCache = new Map<string, CachedBundle>()

/** Test hook: reset the in-memory on-demand build cache. */
export function clearAppClientBundleCache(): void {
  onDemandCache.clear()
}

/** Newest mtime (ms) of any file/directory under `dir`; 0 when unreadable. */
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

async function buildOnDemand(appId: string, appDir: string, entryPath: string): Promise<string> {
  const clientDir = path.join(appDir, 'client')
  const watchedDir = fs.existsSync(clientDir) ? clientDir : path.dirname(entryPath)
  const mtimeMs = latestMtimeMs(watchedDir)

  const cached = onDemandCache.get(appId)
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.code
  }

  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    target: 'es2020',
    write: false,
    minify: false,
    logLevel: 'silent',
    plugins: [hostRuntimeShimPlugin()],
  })

  const code = result.outputFiles[0]?.text ?? ''
  onDemandCache.set(appId, { mtimeMs, code })
  return code
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function sendBundle(reply: FastifyReply, code: string): FastifyReply {
  return reply
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .type('text/javascript; charset=utf-8')
    .send(code)
}

/**
 * Register GET /:appId/client.mjs on the given Fastify instance. Called from
 * appManagementRoutes so the route lives under the /api/apps prefix.
 *
 * Deliberately schema-less: a response-serialization schema would mangle the
 * raw JavaScript string body.
 */
export function registerAppClientBundleRoute(fastify: FastifyInstance): void {
  fastify.get(
    '/:appId/client.mjs',
    async (request: FastifyRequest<{ Params: { appId: string } }>, reply: FastifyReply) => {
      const { appId } = request.params

      // Path-traversal guard FIRST — nothing derived from appId touches the
      // filesystem unless it matches the strict slug shape.
      if (!APP_ID_PATTERN.test(appId)) {
        return reply.status(400).send({ error: 'Invalid app id' })
      }

      let registry: ReturnType<typeof getAppRegistry>
      try {
        registry = getAppRegistry()
      } catch {
        return reply.status(503).send({ error: 'Platform not initialized' })
      }

      const loaded = registry.getLoadedApp(appId)
      if (!loaded) {
        return reply.status(404).send({ error: `App "${appId}" is not installed` })
      }

      const appDir = loaded.dir || path.join(registry.getAppsDir(), appId)

      // 1. Prebuilt bundle shipped inside the app package.
      const prebuiltPath = path.join(appDir, 'client', 'dist', 'index.mjs')
      try {
        if (fs.existsSync(prebuiltPath)) {
          return sendBundle(reply, fs.readFileSync(prebuiltPath, 'utf-8'))
        }
      } catch (error) {
        loggerService.error(`Error reading prebuilt client bundle for "${appId}":`, error)
        return reply.status(500).send({ error: 'Failed to read app client bundle' })
      }

      // 2. On-demand build of the manifest-declared client entry source.
      const entryRel = loaded.manifest.client?.entry
      if (entryRel) {
        const entryPath = path.resolve(appDir, entryRel)
        const appRoot = path.resolve(appDir)
        // Defence in depth: a manifest may not point outside its own app dir.
        if (entryPath !== appRoot && !entryPath.startsWith(appRoot + path.sep)) {
          return reply.status(400).send({ error: 'Invalid client entry path' })
        }
        const resolvedEntry = resolveClientEntryFile(entryPath)
        if (resolvedEntry) {
          try {
            const code = await buildOnDemand(appId, appDir, resolvedEntry)
            return sendBundle(reply, code)
          } catch (error) {
            loggerService.error(`Failed to build client bundle for "${appId}":`, error)
            return reply.status(500).send({ error: 'Failed to build app client bundle' })
          }
        }
      }

      // 3. Nothing to serve.
      return reply.status(404).send({ error: 'App has no client bundle' })
    },
  )
}

export default registerAppClientBundleRoute

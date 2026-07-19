import type { ComponentType, LazyExoticComponent } from 'react'
import { installHostRuntime, getHostRuntime, authFetch as hostAuthFetch } from '../../appRuntime/installHostRuntime'
import { sandboxApi } from '../../services/sandboxApi'

// ============================================================================
// Sandbox preview bundle loading (S6.5)
//
// Loads a synced sandbox's client bundle and mounts it exactly like an
// installed app's pages (AppPageHost.tsx) — SAME host React instance, SAME
// AppContext — with two deliberate differences from the installed-app path:
//
//   1. The bundle endpoint (GET /sandboxes/:id/client.mjs) is authenticated
//      and tenant-scoped (sandbox code is tenant-private, unreleased work —
//      never public marketplace code like an installed app's bundle). A
//      bare `import('/api/sandboxes/:id/client.mjs')` cannot attach the
//      platform's Authorization header, so we fetch the module TEXT with
//      the authenticated fetch and `import()` a
//      `URL.createObjectURL(new Blob([...]))` instead — revoking the object
//      URL once the import settles (success or failure).
//
//   2. The preview runs the app like a normal installed app — its pages
//      READ through to real data — with one safety boundary: it never
//      persists or pushes changes. While the preview is mounted we narrowly
//      override the SHARED host runtime's authFetch so that:
//        - reads (GET/HEAD) to the app's own `/api/apps/<appId>/...` routes
//          pass through to the real (installed) routes, so the UI populates
//          exactly as it would for an installed app;
//        - mutating calls (POST/PUT/PATCH/DELETE) to those routes are
//          intercepted, NOT forwarded, and surfaced as a "not saved in
//          sandbox preview" notice — a work-in-progress app must never write
//          to real tenant data.
//      The external tool the app deploys to (Splunk REST, ACS, Falcon) is
//      already protected at the pipeline layer: deploy/rollback are not
//      runnable in a sandbox (RUNNABLE_HANDLER_NAMES excludes them), so the
//      sandbox can never push a config change to the tool it manages.
//      Everything else (platform APIs) passes through untouched. This is the
//      ONE host runtime the platform installs, never a second one.
//
//      Fidelity note: read pass-through uses the INSTALLED app's routes, so a
//      sandbox that edits its own server/*.ts routes won't see those edits
//      until isolated sandbox route hosting lands (a separate phase). App UI,
//      handlers and read data — the bulk of dev work — are full fidelity.
// ============================================================================

/** Default export shape of a sandbox app's client bundle (same contract as installed apps). */
export interface SandboxAppClientModule {
  id: string
  pages: Record<string, ComponentType | LazyExoticComponent<ComponentType>>
  sidebarItems?: Array<{ path: string; label: string; icon?: string }>
}

/**
 * Fetch a sandbox's client bundle source with the authenticated fetch and
 * `import()` it via a blob object URL. The object URL is revoked once the
 * dynamic import settles (module code has been evaluated by then; revoking
 * earlier would 404 in browsers that fetch it lazily).
 */
export async function importSandboxClientBundle(sandboxId: string): Promise<SandboxAppClientModule> {
  // Idempotent: main.tsx already installs the global at app bootstrap. Calling
  // this here too keeps the preview self-sufficient in contexts that don't go
  // through main.tsx (component tests, storybook-style isolation).
  installHostRuntime()

  const code = await sandboxApi.getClientBundleSource(sandboxId)
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    const mod = (await import(/* @vite-ignore */ blobUrl)) as { default?: SandboxAppClientModule }
    if (!mod?.default) {
      throw new Error('Sandbox client bundle has no default export')
    }
    return mod.default
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

// ---------------------------------------------------------------------------
// App-server-route guard
// ---------------------------------------------------------------------------

export const SANDBOX_WRITE_BLOCKED_MESSAGE =
  'Sandbox preview is read-only — changes are not saved and are not pushed to the tool the app ' +
  'manages. Deploy from an installed app to apply changes.'

/** HTTP methods that only read; safe to pass through to the real routes. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** True for any request path under this app's own server route namespace. */
function isAppServerRoute(url: string, appId: string): boolean {
  let pathname: string
  try {
    pathname = new URL(url, window.location.origin).pathname
  } catch {
    pathname = url
  }
  const prefix = `/api/apps/${appId}`
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Wrap the host's authFetch so the sandboxed app runs like a normal installed
 * app, with one boundary: it never persists or pushes changes.
 *
 * - Reads (GET/HEAD/OPTIONS) — including to the app's own
 *   `/api/apps/<appId>/...` routes — pass through to the real authFetch, so
 *   the preview populates with real (tenant-scoped) data.
 * - Writes (POST/PUT/PATCH/DELETE) to the app's own routes are intercepted,
 *   NOT forwarded, and surfaced via `onBlocked`. A work-in-progress app must
 *   not write to real tenant data from a sandbox.
 * - Everything else (platform APIs) is forwarded unchanged.
 */
export function createPreviewAuthFetch(
  appId: string,
  onBlocked: (path: string) => void,
): (input: string, init?: RequestInit) => Promise<Response> {
  return (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (!READ_METHODS.has(method) && isAppServerRoute(input, appId)) {
      onBlocked(input)
      return Promise.reject(new Error(SANDBOX_WRITE_BLOCKED_MESSAGE))
    }
    return hostAuthFetch(input, init)
  }
}

/**
 * Temporarily override the SHARED host runtime's authFetch (both the
 * top-level `runtime.authFetch` and the `sdk.authFetch` bundled app code
 * actually calls via the `@veltrixsecops/app-sdk` shim) for the lifetime of
 * the preview. Returns a restore function — ALWAYS call it on unmount so
 * the rest of the portal (and any installed-app pages) keep the real
 * authFetch. This is the one platform runtime, narrowly and temporarily
 * patched — never a second runtime instance.
 */
export function installPreviewAuthFetchGuard(appId: string, onBlocked: (path: string) => void): () => void {
  const runtime = getHostRuntime()
  if (!runtime) return () => {}

  const wrapped = createPreviewAuthFetch(appId, onBlocked)
  const originalRuntimeAuthFetch = runtime.authFetch
  const originalSdkAuthFetch = runtime.sdk.authFetch

  runtime.authFetch = wrapped
  runtime.sdk.authFetch = wrapped

  return () => {
    runtime.authFetch = originalRuntimeAuthFetch
    runtime.sdk.authFetch = originalSdkAuthFetch
  }
}

// ========================================================================
// AppPageHost — generic dynamic loader for marketplace app client pages.
//
// Mounted at <Route path="/apps/:appId/*"> (after any legacy hardcoded app
// routes). For ANY enabled app it:
//   1. resolves the app from the enabled-apps context (manifest pages incl.
//      each page's `component` name now survive the /enabled schema),
//   2. dynamically imports the app's bundle from /api/apps/:appId/client.mjs
//      (the host runtime global is installed by installHostRuntime, imported
//      first in main.tsx, so the bundle's react/sdk shims resolve),
//   3. matches the wildcard remainder against the manifest-declared pages,
//   4. renders the page component inside the shared AppContext.Provider,
//      a Suspense boundary and an error boundary with retry.
//
// ZERO app-specific knowledge lives here — everything is driven by the
// app's manifest and its bundle's default export
// ({ id, pages: Record<componentName, Component>, sidebarItems? }).
// ========================================================================

import React, { Suspense, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useApps } from '../../contexts/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { AppContext } from '../../appRuntime/installHostRuntime'
import { EmptyState } from '../../components/shared/EmptyState'
import type { AppPageDeclaration } from '../../../../shared/types/app'
import { AppShell, buildAppNavItems } from './AppShell'
import { AppUpgradeBanner } from './AppUpgradeBanner'
import { useAppRuntimeContext } from './useAppRuntimeContext'

// ---------------------------------------------------------------------------
// Bundle loading
// ---------------------------------------------------------------------------

/** Default export shape of an app client bundle (per the SDK contract). */
export interface AppClientBundleModule {
  id: string
  pages: Record<string, React.ComponentType>
  sidebarItems?: Array<{ path: string; label: string; icon?: string }>
}

const bundleCache = new Map<string, Promise<AppClientBundleModule>>()

/**
 * Import an app's client bundle, memoized per appId. Failed loads are
 * evicted from the cache so a retry re-fetches instead of replaying the
 * cached rejection.
 */
export function loadAppClientBundle(appId: string): Promise<AppClientBundleModule> {
  const cached = bundleCache.get(appId)
  if (cached) return cached

  const promise = import(/* @vite-ignore */ `/api/apps/${appId}/client.mjs`).then(
    (mod) => (mod?.default ?? mod) as AppClientBundleModule,
  )
  promise.catch(() => {
    bundleCache.delete(appId)
  })
  bundleCache.set(appId, promise)
  return promise
}

// ---------------------------------------------------------------------------
// Presentational bits (match the platform's Tailwind styling)
// ---------------------------------------------------------------------------

const CenteredSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-24" role="status" aria-label={label}>
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{label}</p>
  </div>
)

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="max-w-xl mx-auto mt-16 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">{children}</div>
  </div>
)

/**
 * Fail-closed 403 view for a `requiresPermission` page the caller isn't
 * granted (Wave C2, RBAC/IdP hardening 2026-07-10). The server already
 * filters `GET /api/apps/enabled` to permitted pages (R3) — this is
 * defense-in-depth for a stale/cached app list, a deep link, or a
 * permission downgrade since the last fetch.
 */
const AccessDeniedPanel: React.FC<{ pageLabel: string }> = ({ pageLabel }) => (
  <div className="max-w-xl mx-auto mt-16">
    <EmptyState
      icon={<Lock size={40} aria-hidden="true" />}
      title="You don't have permission to view this page"
      description={`Ask your administrator for access to "${pageLabel}", or contact support if you believe this is a mistake.`}
    />
  </div>
)

// ---------------------------------------------------------------------------
// Error boundary around the app's own render tree
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  appId: string
  onRetry: () => void
  children: React.ReactNode
}

class AppPageErrorBoundary extends React.Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <Panel title="This app page crashed">
          <p className="break-words">
            {`"${this.props.appId}" hit an error while rendering: ${this.state.error.message}`}
          </p>
          <button
            type="button"
            className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => {
              this.setState({ error: null })
              this.props.onRetry()
            }}
          >
            Retry
          </button>
        </Panel>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// AppPageHost
// ---------------------------------------------------------------------------

export interface AppPageHostProps {
  /** Injectable bundle loader (tests); defaults to the real dynamic import. */
  loadBundle?: (appId: string) => Promise<AppClientBundleModule>
}

const AppPageHost: React.FC<AppPageHostProps> = ({ loadBundle = loadAppClientBundle }) => {
  const params = useParams()
  const appId = params.appId ?? ''
  const remainder = (params['*'] ?? '').replace(/\/+$/, '')

  const { enabledApps, loading } = useApps()
  const { hasPermission } = usePermissions()
  const app = enabledApps.find((candidate) => candidate.appId === appId)

  const [bundle, setBundle] = useState<AppClientBundleModule | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  const enabledAppId = app?.appId

  // Load (or re-load after retry) the app's client bundle.
  useEffect(() => {
    if (!enabledAppId) return
    let active = true
    setBundle(null)
    setLoadError(null)
    loadBundle(enabledAppId).then(
      (mod) => {
        if (active) setBundle(mod)
      },
      (err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err : new Error(String(err)))
      },
    )
    return () => {
      active = false
    }
  }, [enabledAppId, attempt, loadBundle])

  // Shared with AppConfigTypePage's companion tabs — one source of truth for
  // the customer-scoped settings, fetchers, branding and permission API.
  const contextValue = useAppRuntimeContext(app)

  // ---- Resolution states, cheapest first --------------------------------

  if (loading && !app) {
    return <CenteredSpinner label="Loading apps…" />
  }

  if (!app || !contextValue) {
    return (
      <Panel title="App not available">
        <p>
          {`"${appId}" is not enabled for your organization, or it does not exist.`}
        </p>
        <p className="mt-2">
          <Link to="/marketplace" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Manage apps
          </Link>
        </p>
      </Panel>
    )
  }

  const pages: AppPageDeclaration[] = app.pages ?? []

  // Empty remainder -> land on the app's first declared page.
  if (remainder === '' && pages.length > 0) {
    return <Navigate to={`/apps/${app.appId}${pages[0].path}`} replace />
  }

  const currentPath = `/${remainder}`
  // Exact match first; otherwise longest prefix match so app pages may do
  // their own nested sub-routing under their declared path.
  const page =
    pages.find((candidate) => candidate.path.replace(/\/+$/, '') === currentPath) ??
    pages
      .filter((candidate) => currentPath.startsWith(`${candidate.path.replace(/\/+$/, '')}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]

  // FAIL-CLOSED (design decision 5, RBAC/IdP hardening 2026-07-10): a page
  // declaring `requiresPermission` renders nothing unless it's granted,
  // scoped to this app (design decision 2: also satisfied by a platform
  // wildcard). The server already filters GET /api/apps/enabled to
  // permitted pages (R3) — this is defense-in-depth, not the primary gate.
  const pagePermitted =
    !page?.requiresPermission ||
    hasPermission(page.requiresPermission.resource, page.requiresPermission.action, { appId: app.appId })

  // ---- Body below the app navbar, worst problem first -------------------

  let body: React.ReactNode
  if (pages.length === 0) {
    body = (
      <Panel title="No pages">
        <p>{`"${app.name}" does not declare any client pages.`}</p>
      </Panel>
    )
  } else if (!page) {
    body = (
      <Panel title="Page not found">
        <p>{`"${app.name}" has no page at "${currentPath}". Available pages:`}</p>
        <ul className="mt-3 space-y-1">
          {pages.map((candidate) => (
            <li key={candidate.path}>
              <Link
                to={`/apps/${app.appId}${candidate.path}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {candidate.label}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    )
  } else if (!pagePermitted) {
    body = <AccessDeniedPanel pageLabel={page.label} />
  } else if (loadError) {
    body = (
      <Panel title="Failed to load app">
        <p className="break-words">
          {`The client bundle for "${app.name}" could not be loaded: ${loadError.message}`}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </button>
      </Panel>
    )
  } else if (!bundle) {
    body = <CenteredSpinner label={`Loading ${app.name}…`} />
  } else {
    const PageComponent = bundle.pages?.[page.component]
    body = !PageComponent ? (
      <Panel title="Page unavailable">
        <p>
          {`The "${app.name}" bundle does not export a "${page.component}" component. ` +
            'The app package may be out of date — try reinstalling the app.'}
        </p>
      </Panel>
    ) : (
      <AppPageErrorBoundary
        key={`${app.appId}:${page.path}:${attempt}`}
        appId={app.appId}
        onRetry={() => setAttempt((n) => n + 1)}
      >
        <Suspense fallback={<CenteredSpinner label={`Loading ${page.label}…`} />}>
          <PageComponent />
        </Suspense>
      </AppPageErrorBoundary>
    )
  }

  // The brand palette lives as CSS variables on the AppShell container ONLY —
  // the navbar and anything the app page styles with var(--veltrix-app-*) can
  // use it; nothing outside this subtree ever sees the vendor color. The shell
  // is shared with the generic config authoring pages so the navbar (logo,
  // brand accent, tabs — including one per configuration type) is identical.
  return (
    <AppContext.Provider value={contextValue}>
      <AppShell app={app} navItems={buildAppNavItems(app, hasPermission)} activePath={page?.path ?? null}>
        {/* Consistent content padding for every app bundle page (Overview, Setup
            Guide, and any app-declared page), matching the pipeline surface's
            `p-4 sm:p-6` so the page title/body never sits flush against the
            navbar or the viewport bottom. Config-canvas and pipeline surfaces
            add their own padding, so this lives here (not in AppShell) to avoid
            double-padding them. */}
        <div className="p-4 sm:p-6">
          {/* Generic, per-tenant upgrade banner shown above every app bundle
              page (Overview included): reflects the tenant's installed version
              vs the latest release, and opens the release-notes + upgrade modal.
              Renders nothing when the tenant is already on the latest version. */}
          <AppUpgradeBanner app={app} />
          {body}
        </div>
      </AppShell>
    </AppContext.Provider>
  )
}

export default AppPageHost

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppWindow, Info, RefreshCw, XCircle } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../../components/shared/Card'
import { Button } from '../../../components/shared/Button'
import { Badge } from '../../../components/shared/Badge'
import { EmptyState } from '../../../components/shared/EmptyState'
import { Skeleton } from '../../../components/shared/Skeleton'
import { useToast } from '../../../components/shared/Toast'
import { useSandboxEvents } from '../../../contexts/RealtimeContext'
import { AppContext, type AppContextValue } from '../../../appRuntime/installHostRuntime'
import { fetchJsonArray, fetchAllCredentials } from '../../../appRuntime/appPlatformData'
import { getUser, getCustomerId } from '../../../services/authService'
import type { SandboxDetail, SandboxFileChangedPayload } from '../../../services/sandboxApi'
import { buildDevCommand } from '../sandbox.format'
import { resolvePreviewNav, isFullBleed } from '../previewNav'
import {
  importSandboxClientBundle,
  installPreviewAuthFetchGuard,
  type SandboxAppClientModule,
} from '../previewBundle'
import { PreviewErrorBoundary } from './PreviewErrorBoundary'
import { PreviewNavSwitcher } from './PreviewNavSwitcher'
import type { AppPageDeclaration } from '../../../../../shared/types/app'

export interface SandboxPreviewCardProps {
  sandbox: SandboxDetail
}

/** Coalesce a burst of client/-file sandbox:file-changed events (a CLI sync touching
 * many files at once) into a single re-import instead of one per file. */
const RELOAD_DEBOUNCE_MS = 400

const CenteredSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-16" role="status" aria-label={label}>
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    <p className="mt-3 text-sm text-content-secondary">{label}</p>
  </div>
)

/**
 * Runs the sandbox's own synced client bundle inside the portal, the same
 * way an installed app's pages render inside the host chrome (AppPageHost),
 * so a developer can interact with their work-in-progress app as it will
 * actually behave once installed — including its manifest-declared nav
 * (page switcher + tabs), platform APIs, and its own read routes. It runs
 * like a real installed app with two intentional differences:
 *   - the bundle is fetched with an authenticated request and blob-imported
 *     (sandbox code is tenant-private — see previewBundle.ts)
 *   - it is read-only: writes to the app's own routes are intercepted and
 *     not saved (see the banner below), and the pipeline can't deploy to the
 *     external tool from a sandbox. Reads pass through to real data.
 */
export const SandboxPreviewCard: React.FC<SandboxPreviewCardProps> = ({ sandbox }) => {
  const toast = useToast()
  const { subscribe } = useSandboxEvents(sandbox.id)

  const manifest = sandbox.manifest
  const client = manifest?.client ?? null
  const navEntries = useMemo(() => resolvePreviewNav(client?.pages ?? []), [client])
  const appId = manifest?.appId ?? sandbox.appId
  const canPreview = Boolean(client?.entry) && navEntries.length > 0

  const [bundle, setBundle] = useState<SandboxAppClientModule | null>(null)
  const [bundleError, setBundleError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [blockedPath, setBlockedPath] = useState<string | null>(null)
  const [renderKey, setRenderKey] = useState(0)

  // Keep the active page valid as the resolved nav changes shape (a save that adds,
  // renames or removes pages) — default to the first switcher entry otherwise.
  useEffect(() => {
    if (navEntries.length === 0) {
      setActivePath(null)
      return
    }
    const stillValid = navEntries.some(
      (entry) => entry.page.path === activePath || entry.tabs.some((tab) => tab.path === activePath),
    )
    if (!stillValid) setActivePath(navEntries[0].page.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navEntries])

  // Narrowly override the ONE shared host runtime's authFetch for the lifetime of this
  // card so the sandbox runs read-only: the app's read routes pass through to real data,
  // but a WRITE to its own /api/apps/<appId>/... routes is intercepted and not saved
  // (see previewBundle.ts). Only installed while there is something to actually preview
  // (avoids mutating the shared global for sandboxes with no client UI at all). Restored
  // on unmount / whenever the target appId changes.
  useEffect(() => {
    if (!appId || !canPreview) return undefined
    return installPreviewAuthFetchGuard(appId, (path) => {
      setBlockedPath(path)
      toast.info(`Sandbox preview is read-only — the change to "${path}" was not saved.`)
    })
  }, [appId, canPreview, toast])

  const loadBundle = useCallback(async () => {
    if (!canPreview) return
    setLoading(true)
    setBundleError(null)
    try {
      const mod = await importSandboxClientBundle(sandbox.id)
      setBundle(mod)
      setRenderKey((n) => n + 1)
    } catch (error) {
      setBundle(null)
      setBundleError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      setLoading(false)
    }
    // Deliberately re-runs on `attempt` (manual/auto reload) even though it is not
    // read in the body — it exists purely to bust this callback's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox.id, canPreview, attempt])

  useEffect(() => {
    loadBundle()
  }, [loadBundle])

  // Re-import whenever a sandbox:file-changed event touches anything under client/
  // (portal editor save or a CLI sync) — debounced so a burst becomes one reload.
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== 'sandbox:file-changed') return
      const payload = event.payload as unknown as SandboxFileChangedPayload
      if (payload.path !== 'client' && !payload.path.startsWith('client/')) return
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current)
      reloadTimeoutRef.current = setTimeout(() => setAttempt((n) => n + 1), RELOAD_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current)
    }
  }, [subscribe])

  const contextValue = useMemo<AppContextValue | null>(() => {
    if (!appId) return null
    const user = getUser()
    const customerId = user?.customerId || getCustomerId() || ''
    return {
      appId,
      customerId,
      user,
      customer: null,
      // Sandbox apps are never "installed", so there is no persisted per-customer
      // settings row to load — pages reading ctx.settings see an empty record here.
      settings: {},
      getComponents: () => fetchJsonArray('/api/components'),
      getCredentials: () => fetchAllCredentials(customerId),
      getTags: () => fetchJsonArray('/api/tags'),
      // Sandbox previews deliberately do not enforce requiresPermission (see
      // previewNav.ts's identical rationale) — a developer previewing their
      // own in-progress app should see every page they declared, not be
      // blocked by RBAC grants that aren't even installed/assigned yet.
      permissions: { has: () => true, list: () => [] },
    }
  }, [appId])

  const activePage: AppPageDeclaration | null = useMemo(() => {
    for (const entry of navEntries) {
      if (entry.page.path === activePath) return entry.page
      const tab = entry.tabs.find((t) => t.path === activePath)
      if (tab) return tab
    }
    return navEntries[0]?.page ?? null
  }, [navEntries, activePath])

  const PageComponent = activePage && bundle ? bundle.pages?.[activePage.component] : undefined

  return (
    <Card variant="bordered">
      <CardHeader
        actions={
          canPreview && bundle ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
              isLoading={loading}
              leftIcon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Reload
            </Button>
          ) : undefined
        }
      >
        <h2 className="text-base font-semibold text-content-primary flex items-center gap-2">
          <AppWindow size={18} className="text-primary" aria-hidden="true" />
          Preview
        </h2>
      </CardHeader>

      {!manifest ? (
        <CardBody>
          <EmptyState
            icon={<AppWindow size={40} aria-hidden="true" />}
            title="Nothing to preview yet"
            description={`This sandbox has never synced. Run "${buildDevCommand(sandbox.name)}" from your app directory to sync it, then come back here.`}
          />
        </CardBody>
      ) : !client ? (
        <CardBody>
          <EmptyState
            icon={<AppWindow size={40} aria-hidden="true" />}
            title="This app doesn't declare a client UI"
            description='Add a "client.entry" (and at least one client.pages[] entry) to manifest.yaml and resync to preview it here.'
          />
        </CardBody>
      ) : !canPreview ? (
        <CardBody>
          <EmptyState
            icon={<AppWindow size={40} aria-hidden="true" />}
            title="No page-switcher pages declared"
            description='client.pages[] has no entry with nav: "sidebar" yet, so there is nothing to show in the switcher. (nav: "tab" pages need a "sidebar" parent; nav: "hidden" pages are intentionally never listed.)'
          />
        </CardBody>
      ) : (
        <>
          <CardBody className="border-b border-border">
            <div
              role="note"
              className="flex items-start gap-2 rounded-md border border-info-subtle bg-info-subtle px-3 py-2 text-xs text-info-subtle-foreground"
            >
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                This preview runs your app like an installed app, but <span className="font-medium">read-only</span>:
                reads load real data, while changes aren&apos;t saved and the pipeline can&apos;t deploy to the
                tool it manages. Install the app to apply changes.
                {blockedPath && (
                  <>
                    {' '}
                    <span className="font-medium">Last change not saved:</span>{' '}
                    <code className="font-mono">{blockedPath}</code>
                  </>
                )}
              </span>
            </div>

            <div className="mt-3">
              <PreviewNavSwitcher
                entries={navEntries}
                activePath={activePath ?? navEntries[0].page.path}
                onSelect={(page) => setActivePath(page.path)}
              />
            </div>
          </CardBody>

          <div className={isFullBleed(activePage ?? undefined) ? '' : 'p-4'}>
            {loading && !bundle ? (
              <div className="p-4">
                <Skeleton variant="rectangular" height={220} />
              </div>
            ) : bundleError ? (
              <div
                role="alert"
                className="m-4 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-3 text-sm text-danger-subtle-foreground flex items-start gap-2"
              >
                <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Failed to load the sandbox client bundle</p>
                  <p className="mt-0.5 break-words">{bundleError.message}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </Button>
              </div>
            ) : !bundle || !contextValue || !activePage ? (
              <CenteredSpinner label="Loading preview…" />
            ) : !PageComponent ? (
              <EmptyState
                icon={<XCircle size={40} aria-hidden="true" />}
                title="Page unavailable"
                description={`The client bundle does not export a "${activePage.component}" component for "${activePage.label}". Check that client/index.tsx's pages map matches manifest.yaml.`}
              />
            ) : (
              <AppContext.Provider value={contextValue}>
                <PreviewErrorBoundary
                  key={`${activePage.path}:${renderKey}`}
                  pageLabel={activePage.label}
                  onReload={() => setAttempt((n) => n + 1)}
                >
                  <Suspense fallback={<CenteredSpinner label={`Loading ${activePage.label}…`} />}>
                    <PageComponent />
                  </Suspense>
                </PreviewErrorBoundary>
              </AppContext.Provider>
            )}
          </div>
        </>
      )}

      {canPreview && manifest && (
        <CardBody className="border-t border-border">
          <p className="text-xs text-content-tertiary flex items-center gap-1.5">
            <Badge variant="secondary" size="sm">
              {appId}
            </Badge>
            Synced {sandbox.lastSyncAt ? new Date(sandbox.lastSyncAt).toLocaleString() : 'never'}
          </p>
        </CardBody>
      )}
    </Card>
  )
}

export default SandboxPreviewCard

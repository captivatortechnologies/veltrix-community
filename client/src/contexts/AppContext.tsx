import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { appService, type EnabledApp } from '../services/appService'
import { isAuthenticated } from '../services/authService'
import type { AppPageDeclaration } from '../../../shared/types/app'

interface AppContextValue {
  enabledApps: EnabledApp[]
  loading: boolean
  error: string | null
  refreshApps: () => Promise<void>
  getSidebarPages: () => Array<AppPageDeclaration & { appId: string; appName: string }>
}

const AppContext = createContext<AppContextValue>({
  enabledApps: [],
  loading: false,
  error: null,
  refreshApps: async () => {},
  getSidebarPages: () => [],
})

export const useApps = () => useContext(AppContext)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabledApps, setEnabledApps] = useState<EnabledApp[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // AppProvider sits above <Routes> (see App.tsx) so it never unmounts on
  // ordinary navigation - including logout, which is a client-side
  // `navigate('/login')`, not a full page reload. `location` lets the effect
  // below react to that transition instead of only running once on mount.
  const location = useLocation()

  // GET /api/apps/enabled is customer-scoped server-side (resolved from the
  // caller's JWT), so `enabledApps` always reflects the signed-in tenant -
  // never global/platform-wide data. Still, when there's no authenticated
  // user we must not merely skip refetching: a previous tenant's data left
  // in this component's memory (e.g. right after logout, before the next
  // login) would otherwise keep rendering in the sidebar/breadcrumbs.
  const refreshApps = useCallback(async () => {
    if (!isAuthenticated()) {
      setEnabledApps([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const apps = await appService.getEnabledApps()
      setEnabledApps(apps)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apps')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load on mount (covers the common case: login is a hard reload -
  // see LoginPage/OAuthCallbackPage's `window.location.href = '/'` - so this
  // effect running once already sees the freshly-authenticated tenant).
  useEffect(() => {
    refreshApps()
  }, [refreshApps])

  // Defense in depth for the SPA-only logout transition: re-check auth state
  // on every route change, but only act (clear or refetch) when it actually
  // flips, so ordinary navigation between authenticated pages never triggers
  // a redundant refetch.
  const wasAuthenticatedRef = useRef<boolean>(isAuthenticated())
  useEffect(() => {
    const authed = isAuthenticated()
    if (authed === wasAuthenticatedRef.current) return
    wasAuthenticatedRef.current = authed
    refreshApps()
  }, [location.pathname, refreshApps])

  const getSidebarPages = useCallback(() => {
    return enabledApps.flatMap((app) =>
      (app.pages || [])
        .filter((page) => page.sidebar)
        .map((page) => ({
          ...page,
          appId: app.appId,
          appName: app.name,
        })),
    )
  }, [enabledApps])

  return (
    <AppContext.Provider value={{ enabledApps, loading, error, refreshApps, getSidebarPages }}>
      {children}
    </AppContext.Provider>
  )
}

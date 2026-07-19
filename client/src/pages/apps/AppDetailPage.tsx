import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronRight, Package } from 'lucide-react'
import { Card, CardBody, CardHeader } from '../../components/shared/Card'
import { EmptyState } from '../../components/shared/EmptyState'
import { Skeleton } from '../../components/shared/Skeleton'
import { Badge } from '../../components/shared/Badge'
import { appService } from '../../services/appService'
import { useApps } from '../../contexts/AppContext'
import type { AppDetail } from '../../../../shared/types/app'
import { AppShell, buildAppNavItems } from './AppShell'

/**
 * Home surface for any installed app: `/apps/:appId` — the "Open app" landing.
 *
 * Rendered inside the shared {@link AppShell}, so it carries the SAME branded
 * navbar as the app's own pages and the config authoring pages: [logo] [name]
 * [tabs], where the tabs link to the app's client pages and to each
 * configuration type. This page is the app's manifest-driven home — status,
 * description, clickable configuration types (each a one-click entry into the
 * Configuration Canvas), and declared settings — with the navbar making the
 * rest of the app reachable.
 *
 * Everything is driven by the app's manifest (`GET /api/apps/:appId`), scoped
 * to the signed-in organization. Apps with a bespoke platform experience (e.g.
 * splunk-enterprise) are matched by their own, more specific route first.
 */
export default function AppDetailPage() {
  const { appId = '' } = useParams<{ appId: string }>()
  const { enabledApps } = useApps()
  const [app, setApp] = useState<AppDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The enabled-apps context drives the branded shell/navbar; the richer
  // AppDetail (settings, license, componentTypes) comes from its own fetch.
  const enabledApp = enabledApps.find((candidate) => candidate.appId === appId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setApp(await appService.getAppDetail(appId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load app')
      setApp(null)
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    void load()
  }, [load])

  // Consolidate the app's "Home" (this generic platform view) with its own
  // Overview page: when the enabled app declares its own first page, the bare
  // /apps/:appId route redirects to it so there is a SINGLE landing surface
  // instead of two near-identical overviews. Apps that declare no pages of
  // their own fall through and render this detail view as their home.
  if (enabledApp) {
    const landing = buildAppNavItems(enabledApp).find(
      (item) => item.group === 'page' && item.path !== '/pipeline',
    )
    if (landing) {
      return <Navigate to={`/apps/${appId}${landing.path}`} replace />
    }
  }

  const body = (() => {
    if (loading) {
      return (
        <div className="space-y-4 p-4 sm:p-6" aria-busy="true">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      )
    }

    if (error || !app) {
      return (
        <div className="p-4 sm:p-6">
          <EmptyState
            icon={<Package className="h-10 w-10" aria-hidden="true" />}
            title="App not available"
            description={
              error ??
              `No app "${appId}" is installed for your organization. Install it from the marketplace to continue.`
            }
            action={
              <Link
                to="/marketplace"
                className="text-primary hover:text-primary-hover font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Browse apps
              </Link>
            }
          />
        </div>
      )
    }

    return (
      <div className="space-y-6 p-4 sm:p-6">
        {app.description ? (
          <p className="max-w-3xl text-content-secondary">{app.description}</p>
        ) : null}

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-content-primary">Configuration types</h2>
          </CardHeader>
          <CardBody>
            {app.configurationTypes.length === 0 ? (
              <p className="text-sm text-content-tertiary">This app declares no configuration types.</p>
            ) : (
              <ul className="divide-y divide-border">
                {app.configurationTypes.map((ct) => (
                  <li key={ct.id}>
                    <Link
                      to={`/apps/${appId}/config/${ct.id}`}
                      className="group flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded px-2 py-2.5 -mx-2 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="font-medium text-content-primary">{ct.name}</span>
                      <code className="text-xs text-content-tertiary">{ct.id}</code>
                      {ct.componentTypes.length > 0 ? (
                        <span className="text-xs text-content-secondary">
                          targets {ct.componentTypes.join(', ')}
                        </span>
                      ) : null}
                      <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        Configure
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {app.settings.length > 0 ? (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-content-primary">Settings</h2>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-sm text-content-secondary">
                Configured per organization from the Apps page.
              </p>
              <ul className="divide-y divide-border">
                {app.settings.map((setting) => (
                  <li key={setting.key} className="flex flex-wrap items-baseline gap-x-3 py-2">
                    <span className="font-medium text-content-primary">{setting.label}</span>
                    <code className="text-xs text-content-tertiary">{setting.key}</code>
                    {setting.required ? <Badge variant="warning">required</Badge> : null}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    )
  })()

  // Enabled apps render inside the branded shell (navbar + tabs to pages and
  // configuration types). If the app isn't enabled for this org, there is no
  // shell context to build a navbar from — show the body (its own error/detail)
  // on its own.
  if (!enabledApp) {
    return <div className="min-h-full">{body}</div>
  }

  return (
    <AppShell app={enabledApp} navItems={buildAppNavItems(enabledApp)} activePath={null}>
      {body}
    </AppShell>
  )
}

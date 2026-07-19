import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageCheck, Search, RefreshCw, AlertCircle, ArrowRight } from 'lucide-react'
import { useApps } from '../../contexts/AppContext'
import { usePermissions } from '../../hooks/usePermissions'
import { appService } from '../../services/appService'
import { Button } from '../../components/shared/Button'
import { Input } from '../../components/shared/Input'
import { Select } from '../../components/shared/Select'
import { EmptyState } from '../../components/shared/EmptyState'
import { SkeletonCard } from '../../components/shared/Skeleton'
import {
  resolveSidebarAppGroups,
  type ResolvedSidebarPage,
} from '../../components/ui/sidebar/resolveSidebarNav'
import { MARKETPLACE_PATH } from '../../components/ui/sidebar/installedAppsLink'
import InstalledAppCard from './InstalledAppCard'
import type { AppListItem } from '../../../../shared/types/app'

type EnabledFilter = 'all' | 'enabled' | 'disabled'
const ENABLED_FILTERS: EnabledFilter[] = ['all', 'enabled', 'disabled']

/**
 * `/installed-apps` — the destination behind the sidebar's "Apps" nav item
 * (org scope is implicit there; this page's own heading spells it out as
 * "Installed Apps" to stay unambiguous next to the Marketplace).
 *
 * Lists every app installed for the signed-in organization, regardless of
 * enabled state, at a density that scales past a handful of apps (unlike the
 * old per-app nested sidebar groups this replaces). Complements the
 * Marketplace (`/apps`): this page answers "what do we have", the
 * Marketplace answers "what could we add".
 *
 * Multi-tenant note: `GET /api/apps` returns every app registered on the
 * *platform*, each annotated with `installed`/`enabled` resolved from this
 * tenant's `AppInstallation` rows — never global/cross-tenant state. This
 * page filters to `installed: true` client-side to scope itself to "this
 * organization's" apps.
 */
const InstalledAppsPage: React.FC = () => {
  const { enabledApps, refreshApps } = useApps()
  const { hasPermission } = usePermissions()

  const [apps, setApps] = useState<AppListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all')

  const fetchInstalledApps = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await appService.listApps()
      setApps(data.filter((app) => app.installed))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load installed apps')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInstalledApps()
  }, [fetchInstalledApps])

  const handleRefresh = () => {
    fetchInstalledApps()
    refreshApps()
  }

  // Ordered `nav: 'sidebar'` pages per app, reusing the exact same
  // filter/order rule the sidebar itself used to apply (only `nav:'sidebar'`
  // pages, sorted by `order` then `label`) so this page's quick links never
  // drift from that contract. Only ever populated for ENABLED apps — the
  // manifest page data comes from GET /api/apps/enabled, which does not
  // (and cannot) describe a disabled app's pages. `hasPermission` FAIL-CLOSED
  // gates any `requiresPermission` page (design decision 5) — the server
  // already filters GET /api/apps/enabled to permitted pages, so this is
  // defense-in-depth against a stale/cached enabledApps payload.
  const pagesByAppId = useMemo(() => {
    const groups = resolveSidebarAppGroups(enabledApps, { hasPermission })
    const map = new Map<string, ResolvedSidebarPage[]>()
    for (const group of groups) {
      map.set(
        group.appId,
        group.sections.flatMap((section) => section.pages),
      )
    }
    return map
  }, [enabledApps, hasPermission])

  /** Honest per-app page list: `null` means "unknown - app is disabled", never a guess. */
  const pagesFor = useCallback(
    (app: AppListItem): ResolvedSidebarPage[] | null => {
      const known = pagesByAppId.get(app.appId)
      if (known) return known
      // Not in the map: either genuinely disabled (no manifest data), or an
      // enabled app that simply declares zero sidebar pages.
      return app.enabled ? [] : null
    },
    [pagesByAppId],
  )

  const vendors = useMemo(() => Array.from(new Set(apps.map((a) => a.vendor))).sort(), [apps])
  const categories = useMemo(() => Array.from(new Set(apps.map((a) => a.category))).sort(), [apps])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return apps
      .filter((app) => {
        const matchesSearch =
          !q ||
          app.name.toLowerCase().includes(q) ||
          app.vendor.toLowerCase().includes(q) ||
          app.category.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q)
        const matchesVendor = !vendorFilter || app.vendor === vendorFilter
        const matchesCategory = !categoryFilter || app.category === categoryFilter
        const matchesEnabled =
          enabledFilter === 'all' ||
          (enabledFilter === 'enabled' && !!app.enabled) ||
          (enabledFilter === 'disabled' && !app.enabled)
        return matchesSearch && matchesVendor && matchesCategory && matchesEnabled
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [apps, search, vendorFilter, categoryFilter, enabledFilter])

  const enabledCount = apps.filter((a) => a.enabled).length
  const pluralize = (count: number) => (count !== 1 ? 's' : '')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PackageCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Installed Apps</h1>
            <p className="text-sm text-content-secondary">
              {apps.length} app{pluralize(apps.length)} installed for your organization
              {apps.length > 0 && <> &middot; {enabledCount} enabled</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={MARKETPLACE_PATH}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-content-primary shadow-sm transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Browse the marketplace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Button
            variant="secondary"
            size="md"
            onClick={handleRefresh}
            disabled={loading}
            leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-danger-subtle-foreground">
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading installed apps"
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} className="border border-border" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-raised">
          <EmptyState
            icon={<PackageCheck size={40} aria-hidden="true" />}
            title="No apps installed yet"
            description={
              error ? 'Apps could not be loaded right now.' : 'Install an app from the marketplace to see it here.'
            }
            action={
              <Link
                to={MARKETPLACE_PATH}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Browse the marketplace
              </Link>
            }
          />
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <div className="max-w-md flex-1">
              <Input
                type="text"
                aria-label="Search installed apps by name, vendor, or category"
                placeholder="Search by name, vendor, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              />
            </div>

            <div className="md:w-44">
              <Select
                aria-label="Filter by vendor"
                placeholder="All Vendors"
                value={vendorFilter}
                onChange={setVendorFilter}
                options={[{ value: '', label: 'All Vendors' }, ...vendors.map((v) => ({ value: v, label: v }))]}
              />
            </div>

            <div className="md:w-44">
              <Select
                aria-label="Filter by category"
                placeholder="All Categories"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: '', label: 'All Categories' },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>

            <div
              className="flex overflow-hidden rounded-lg border border-border"
              role="group"
              aria-label="Filter by enabled state"
            >
              {ENABLED_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEnabledFilter(f)}
                  aria-pressed={enabledFilter === f}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                    enabledFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-raised">
              <EmptyState
                icon={<Search size={40} aria-hidden="true" />}
                title="No results found"
                description="Try adjusting your search or filters."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((app) => (
                <InstalledAppCard key={app.appId} app={app} pages={pagesFor(app)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default InstalledAppsPage

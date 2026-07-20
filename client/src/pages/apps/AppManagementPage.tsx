import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Package,
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Power,
  PowerOff,
  AlertCircle,
  ArrowUpCircle,
  Puzzle,
  Upload,
  Settings,
  Trash2,
  ArrowUpRight,
} from 'lucide-react'
import { useApps } from '../../contexts/AppContext'
import { appService } from '../../services/appService'
import type { MarketplaceEntry } from '../../services/appService'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { Button } from '../../components/shared/Button'
import { Input } from '../../components/shared/Input'
import { EmptyState } from '../../components/shared/EmptyState'
import { SkeletonCard } from '../../components/shared/Skeleton'
import { Select } from '../../components/shared/Select'
import { toolsApi } from '../../features/tools-integration/api'
import { createSlug } from '../../utils/url-utils'
import type { AppListItem } from '../../../../shared/types/app'
import AppUploadDialog from './AppUploadDialog'
import AppSettingsDialog from './AppSettingsDialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'installed' | 'enabled' | 'available'

const STATUS_FILTERS: StatusFilter[] = ['all', 'installed', 'enabled', 'available']
const STATUS_QUERY_PARAM = 'status'

/**
 * Parses the `status` query param into a known `StatusFilter`, defaulting to
 * 'all' for a missing/unrecognized value (e.g. a stale bookmark, a typo'd
 * deep link) rather than throwing or silently rendering an empty filter set.
 */
function parseStatusFilter(value: string | null): StatusFilter {
  return (STATUS_FILTERS as string[]).includes(value ?? '') ? (value as StatusFilter) : 'all'
}

/**
 * Minimal dotted-numeric version comparison (no pre-release/build metadata support —
 * every version currently in the marketplace catalog and app manifests is plain
 * `MAJOR.MINOR.PATCH`). Returns true only when `catalogVersion` is unambiguously newer
 * than `installedVersion`. Any unparsed segment makes this return false — we'd rather
 * stay silent than show an incorrect "Update available" badge.
 */
function isNewerVersion(catalogVersion: string, installedVersion: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10))
  const catalogParts = parse(catalogVersion)
  const installedParts = parse(installedVersion)
  if (catalogParts.some(Number.isNaN) || installedParts.some(Number.isNaN)) return false

  const length = Math.max(catalogParts.length, installedParts.length)
  for (let i = 0; i < length; i++) {
    const c = catalogParts[i] ?? 0
    const inst = installedParts[i] ?? 0
    if (c > inst) return true
    if (c < inst) return false
  }
  return false
}

interface Tool {
  id: number
  name: string
  description: string
  vendor: string
  category: string
  logoUrl?: string
  isActive: boolean
}

interface MarketplaceItem {
  key: string
  kind: 'app' | 'tool' | 'marketplace'
  name: string
  description: string
  vendor: string
  category: string
  icon?: string
  logoUrl?: string
  logoDarkUrl?: string
  version?: string
  enabled: boolean
  source?: string
  installed?: boolean
  hasSettings?: boolean
  app?: AppListItem
  tool?: Tool
  marketplaceEntry?: MarketplaceEntry
  /** Marketplace catalog version for this app, if it exists there (installed or not). */
  catalogVersion?: string
  /** True when the marketplace catalog carries a strictly newer version than what's installed. */
  updateAvailable?: boolean
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const categoryColors: Record<string, string> = {
  security: 'bg-danger-subtle text-danger-subtle-foreground',
  siem: 'bg-info-subtle text-info-subtle-foreground',
  edr: 'bg-warning-subtle text-warning-subtle-foreground',
  monitoring: 'bg-success-subtle text-success-subtle-foreground',
  compliance: 'bg-primary-subtle text-primary-subtle-foreground',
  identity: 'bg-warning-subtle text-warning-subtle-foreground',
}

const getCategoryColor = (category: string) =>
  categoryColors[category.toLowerCase()] || 'bg-surface-hover text-content-secondary'

// ---------------------------------------------------------------------------
// MarketplaceCard — single card for both apps and tools
// ---------------------------------------------------------------------------

interface MarketplaceCardProps {
  item: MarketplaceItem
  toggling: boolean
  onToggle: () => void
  onSettings?: () => void
  onUninstall?: () => void
  onInstall?: () => void
  onOpen?: () => void
}

const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  item,
  toggling,
  onToggle,
  onSettings,
  onUninstall,
  onInstall,
  onOpen,
}) => (
  <div
    className={`group bg-surface-raised border border-border rounded-lg p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${item.enabled && onOpen ? 'cursor-pointer hover:border-primary/40' : ''}`}
    onClick={(e) => {
      // Only navigate if clicking on the card body, not on buttons
      if (item.enabled && onOpen && (e.target as HTMLElement).closest('button') === null) {
        onOpen()
      }
    }}
  >
    {/* Header */}
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        {item.logoUrl ? (
          // Brand logo (light + dark variants) — theme-aware, sized to the card.
          <span className="flex h-10 max-w-[8rem] flex-shrink-0 items-center">
            <img
              src={item.logoUrl}
              alt=""
              className={`h-6 w-auto max-w-full object-contain${item.logoDarkUrl ? ' dark:hidden' : ''}`}
            />
            {item.logoDarkUrl && (
              <img
                src={item.logoDarkUrl}
                alt=""
                aria-hidden="true"
                className="hidden h-6 w-auto max-w-full object-contain dark:block"
              />
            )}
          </span>
        ) : (
          <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gradient-to-br from-primary to-info flex items-center justify-center text-primary-foreground font-bold text-lg">
            {item.icon ? (
              <span className="text-xl" aria-hidden="true">{item.icon}</span>
            ) : (
              item.name.charAt(0).toUpperCase()
            )}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-content-primary truncate">{item.name}</h3>
          <p className="text-xs text-content-tertiary flex items-center gap-1 flex-wrap">
            {item.version && <span>v{item.version}</span>}
            <span>&middot; {item.vendor}</span>
            {item.updateAvailable && (
              <span
                className="inline-flex items-center gap-0.5 text-warning-subtle-foreground bg-warning-subtle rounded-full px-1.5 py-0.5"
                title={`A newer version (v${item.catalogVersion}) is available in the marketplace. In-place updates aren't supported yet — reinstall from the marketplace catalog.`}
              >
                <ArrowUpCircle className="w-3 h-3" aria-hidden="true" />
                Update available
              </span>
            )}
          </p>
        </div>
      </div>
      {item.enabled && (
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Enabled
          </span>
          {onOpen && (
            <span className="flex items-center gap-0.5 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Open <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </div>

    {/* Description */}
    <p className="text-sm text-content-secondary line-clamp-2 flex-1">
      {item.description}
    </p>

    {/* Footer */}
    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getCategoryColor(item.category)}`}>
          {item.category}
        </span>
        {item.source === 'BUILT_IN' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-info-subtle text-info-subtle-foreground font-medium">
            Built-in
          </span>
        )}
        {item.source === 'CUSTOM' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning-subtle text-warning-subtle-foreground font-medium">
            Custom
          </span>
        )}
        {item.source === 'MARKETPLACE' && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-subtle text-primary-subtle-foreground font-medium">
            Marketplace
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Marketplace: Install or Coming Soon */}
        {item.kind === 'marketplace' && item.marketplaceEntry?.downloadUrl && onInstall && (
          <button
            onClick={onInstall}
            disabled={toggling}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-subtle rounded-lg transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Install
          </button>
        )}
        {item.kind === 'marketplace' && !item.marketplaceEntry?.downloadUrl && (
          <span className="text-[10px] px-3 py-1.5 text-content-tertiary font-medium">
            Coming Soon
          </span>
        )}

        {/* Settings button */}
        {item.kind === 'app' && item.enabled && item.hasSettings && onSettings && (
          <button
            onClick={onSettings}
            className="p-1.5 text-content-tertiary hover:text-content-primary hover:bg-surface-hover rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Settings"
            aria-label={`${item.name} settings`}
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Uninstall button (non-built-in only) */}
        {item.kind === 'app' && item.source !== 'BUILT_IN' && onUninstall && (
          <button
            onClick={onUninstall}
            className="p-1.5 text-content-tertiary hover:text-danger hover:bg-danger-subtle rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            title="Uninstall"
            aria-label={`Uninstall ${item.name}`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}

        {/* Enable/Disable toggle (apps and tools) */}
        {(item.kind === 'app' || item.kind === 'tool') && (
          <button
            onClick={onToggle}
            disabled={toggling}
            aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 ${
              item.enabled
                ? 'text-danger hover:bg-danger-subtle focus-visible:ring-danger'
                : 'text-success hover:bg-success-subtle focus-visible:ring-success'
            } disabled:opacity-50`}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : item.enabled ? (
              <PowerOff className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {item.enabled ? 'Disable' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  </div>
)

// ---------------------------------------------------------------------------
// AppManagementPage
// ---------------------------------------------------------------------------

const AppManagementPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshApps } = useApps()
  const { confirm } = useConfirmDialog()

  // App state
  const [apps, setApps] = useState<AppListItem[]>([])
  const [appsLoading, setAppsLoading] = useState(true)
  const [appsError, setAppsError] = useState<string | null>(null)
  const [togglingApp, setTogglingApp] = useState<string | null>(null)

  // Tool state
  const [tools, setTools] = useState<Tool[]>([])
  const [toolsLoading, setToolsLoading] = useState(true)
  const [toolsError, setToolsError] = useState<string | null>(null)
  // Surfaces enable/disable/install/uninstall FAILURES (e.g. a permission 403).
  // These were previously only console.error'd, so a blocked "Enable" click
  // looked like nothing happened at all.
  const [actionError, setActionError] = useState<string | null>(null)

  // Marketplace catalog state
  const [catalogEntries, setCatalogEntries] = useState<MarketplaceEntry[]>([])

  // Dialog state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [settingsApp, setSettingsApp] = useState<{ appId: string; name: string } | null>(null)
  const [uninstallingApp, setUninstallingApp] = useState<string | null>(null)

  // Filter options
  const [vendors, setVendors] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])

  // Filter state
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  // The status filter's source of truth is the URL's `status` query param (not
  // component state) so the filter is deep-linkable — landing on
  // `/apps?status=installed` (e.g. via the sidebar's "Installed Apps" link)
  // preselects that filter, and the browser back/forward buttons work as expected.
  // Default ('all', i.e. no `status` param) matters too: apps that are installed
  // but not yet enabled (e.g. a second built-in app the tenant hasn't turned on)
  // must be visible on first load, not hidden behind a filter the user has to discover.
  const statusFilter = parseStatusFilter(searchParams.get(STATUS_QUERY_PARAM))

  const setStatusFilter = useCallback(
    (next: StatusFilter) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next === 'all') {
            params.delete(STATUS_QUERY_PARAM) // keep the URL clean for the default state
          } else {
            params.set(STATUS_QUERY_PARAM, next)
          }
          return params
        },
        { replace: true } // filter clicks replace the current history entry, they don't stack up
      )
    },
    [setSearchParams]
  )

  // ---- Data fetching ----

  const fetchApps = async () => {
    setAppsLoading(true)
    setAppsError(null)
    try {
      const data = await appService.listApps()
      setApps(data)
    } catch (err) {
      setAppsError(err instanceof Error ? err.message : 'Failed to load apps')
    } finally {
      setAppsLoading(false)
    }
  }

  const fetchTools = async () => {
    setToolsLoading(true)
    setToolsError(null)
    try {
      const response = await toolsApi.getAllTools()
      const toolsArray = Array.isArray(response) ? response : response.data || []
      setTools(toolsArray.filter((t: Tool) => t.isActive))
    } catch (err) {
      setToolsError(
        err instanceof Error ? `Unable to load tools: ${err.message}` : 'Unable to load tools.'
      )
    } finally {
      setToolsLoading(false)
    }
  }

  const fetchMarketplace = async () => {
    try {
      const entries = await appService.getMarketplace()
      setCatalogEntries(entries)
    } catch {
      // Non-critical - marketplace catalog is supplementary
    }
  }

  const fetchFilterOptions = async () => {
    try {
      const [v, c] = await Promise.all([toolsApi.getVendors(), toolsApi.getCategories()])
      setVendors(v)
      setCategories(c)
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    fetchApps()
    fetchTools()
    fetchMarketplace()
    fetchFilterOptions()
  }, [])

  const handleRefresh = () => {
    fetchApps()
    fetchTools()
    fetchMarketplace()
    fetchFilterOptions()
  }

  const handleToggle = async (app: AppListItem) => {
    setTogglingApp(app.appId)
    setActionError(null)
    const action = app.enabled ? 'disable' : 'enable'
    try {
      if (app.enabled) {
        await appService.disableApp(app.appId)
      } else {
        await appService.enableApp(app.appId)
      }
      await fetchApps()
      await refreshApps()
    } catch (err) {
      console.error(`Failed to ${action} app:`, err)
      // Surface the server's reason (permission 403, or any failure) instead of
      // silently swallowing it — the click otherwise appears to do nothing.
      setActionError(err instanceof Error ? err.message : `Failed to ${action} "${app.name}".`)
    } finally {
      setTogglingApp(null)
    }
  }

  const handleUninstall = async (app: AppListItem) => {
    const confirmed = await confirm({
      title: 'Uninstall App',
      message: `Are you sure you want to uninstall "${app.name}"? This cannot be undone.`,
      confirmText: 'Uninstall',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    setUninstallingApp(app.appId)
    setActionError(null)
    try {
      await appService.uninstallApp(app.appId)
      await fetchApps()
      await refreshApps()
    } catch (err) {
      console.error('Failed to uninstall app:', err)
      setActionError(err instanceof Error ? err.message : `Failed to uninstall "${app.name}".`)
    } finally {
      setUninstallingApp(null)
    }
  }

  const [installingMarketplace, setInstallingMarketplace] = useState<string | null>(null)

  const handleInstallMarketplace = async (entry: MarketplaceEntry) => {
    setInstallingMarketplace(entry.appId)
    setActionError(null)
    try {
      await appService.installApp(entry.appId)
      await fetchApps()
      await fetchMarketplace()
      await refreshApps()
    } catch (err) {
      console.error('Failed to install marketplace app:', err)
      setActionError(err instanceof Error ? err.message : `Failed to install "${entry.name}".`)
    } finally {
      setInstallingMarketplace(null)
    }
  }

  // ---- Unified marketplace items ----

  const installedAppIds = useMemo(() => new Set(apps.map((a) => a.appId)), [apps])

  const allVendors = useMemo(() => {
    const appVendors = apps.map((a) => a.vendor)
    const catalogVendors = catalogEntries.map((e) => e.vendor)
    return Array.from(new Set([...vendors, ...appVendors, ...catalogVendors])).sort()
  }, [apps, vendors, catalogEntries])

  const allCategories = useMemo(() => {
    const appCats = apps.map((a) => a.category)
    const catalogCats = catalogEntries.map((e) => e.category)
    return Array.from(new Set([...categories, ...appCats, ...catalogCats])).sort()
  }, [apps, categories, catalogEntries])

  // Marketplace catalog entries keyed by appId, so installed apps can be checked for
  // an available update even though they were already filtered out of `catalogItems`.
  const catalogByAppId = useMemo(
    () => new Map(catalogEntries.map((e) => [e.appId, e])),
    [catalogEntries],
  )

  const items: MarketplaceItem[] = useMemo(() => {
    const appItems: MarketplaceItem[] = apps.map((a) => {
      const catalogEntry = catalogByAppId.get(a.appId)
      return {
        key: `app-${a.appId}`,
        kind: 'app',
        name: a.name,
        description: a.description,
        vendor: a.vendor,
        category: a.category,
        icon: a.icon,
        logoUrl: a.branding?.logoUrl,
        logoDarkUrl: a.branding?.logoDarkUrl,
        version: a.version,
        enabled: !!a.enabled,
        installed: !!a.installed,
        source: a.source,
        hasSettings: true, // All apps potentially have settings
        app: a,
        catalogVersion: catalogEntry?.version,
        updateAvailable: !!catalogEntry && isNewerVersion(catalogEntry.version, a.version),
      }
    })

    // Legacy Tool rows frequently mirror a marketplace app or an installed app of
    // the same name — the tool seed and the catalog both ship "Splunk Enterprise",
    // "CrowdStrike Falcon", etc. — which rendered the product twice in the grid.
    // Hide any tool already represented by an app or catalog entry (matched on a
    // normalized name). Tools with no app/catalog equivalent still show.
    const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    const appOrCatalogNames = new Set<string>([
      ...appItems.map((i) => normalizeName(i.name)),
      ...catalogEntries.map((e) => normalizeName(e.name)),
    ])
    const toolItems: MarketplaceItem[] = tools
      .filter((t) => !appOrCatalogNames.has(normalizeName(t.name)))
      .map((t) => ({
        key: `tool-${t.id}`,
        kind: 'tool',
        name: t.name,
        description: t.description,
        vendor: t.vendor,
        category: t.category,
        enabled: false,
        tool: t,
      }))

    // Add marketplace entries that aren't already installed
    const catalogItems: MarketplaceItem[] = catalogEntries
      .filter((e) => !installedAppIds.has(e.appId))
      .map((e) => ({
        key: `marketplace-${e.appId}`,
        kind: 'marketplace',
        name: e.name,
        description: e.description,
        vendor: e.vendor,
        category: e.category,
        icon: e.icon,
        logoUrl: e.logo,
        logoDarkUrl: e.logoDark,
        version: e.version,
        enabled: false,
        installed: false,
        source: 'MARKETPLACE',
        marketplaceEntry: e,
      }))

    return [...appItems, ...catalogItems, ...toolItems]
  }, [apps, tools, catalogEntries, installedAppIds, catalogByAppId])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const q = search.toLowerCase()
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.vendor.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)

      const matchesVendor = !vendorFilter || item.vendor === vendorFilter
      const matchesCategory = !categoryFilter || item.category === categoryFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && item.enabled) ||
        // Installed = registered for this tenant, regardless of enabled/disabled state
        // (an installed-but-disabled app, e.g. Splunk Cloud, must still show up here).
        // Scoped to `kind === 'app'` - marketplace-only entries and vendor tools aren't
        // "installed" in the App/AppInstallation sense even though they can be "enabled".
        (statusFilter === 'installed' && item.kind === 'app' && !!item.installed) ||
        (statusFilter === 'available' && !item.enabled)

      return matchesSearch && matchesVendor && matchesCategory && matchesStatus
    })
  }, [items, search, vendorFilter, categoryFilter, statusFilter])

  // ---- Derived ----

  const loading = appsLoading || toolsLoading
  const enabledCount = apps.filter((a) => a.enabled).length
  const installedCount = apps.filter((a) => a.installed).length
  const availableCount = items.filter((item) => !item.enabled).length
  const marketplaceAvailableCount = catalogEntries.filter(
    (e) => e.available && !installedAppIds.has(e.appId),
  ).length
  const error = actionError || appsError || toolsError
  const pluralize = (count: number) => (count !== 1 ? 's' : '')

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Puzzle className="w-7 h-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Marketplace</h1>
            {/* Subtitle reflects the active status filter rather than always showing the
                same fixed summary, so it stays accurate for whichever tab is selected.
                "Installed"/"enabled" always mean installed/enabled *for this organization*
                (the API scopes both to the caller's customerId server-side) - the copy says
                so explicitly rather than reading as a platform-wide count. "Available" is
                the shared marketplace catalog, which is legitimately cross-tenant, so it's
                not phrased as org-scoped. */}
            <p className="text-sm text-content-secondary">
              {statusFilter === 'all' && (
                <>
                  {enabledCount} of {apps.length} app{pluralize(apps.length)} enabled for your organization
                  {marketplaceAvailableCount > 0 && (
                    <> &middot; {marketplaceAvailableCount} available in marketplace</>
                  )}
                  {tools.length > 0 && (
                    <> &middot; {tools.length} vendor integration{pluralize(tools.length)}</>
                  )}
                </>
              )}
              {statusFilter === 'installed' && (
                <>{installedCount} app{pluralize(installedCount)} installed for your organization</>
              )}
              {statusFilter === 'enabled' && (
                <>{enabledCount} app{pluralize(enabledCount)} enabled for your organization</>
              )}
              {statusFilter === 'available' && (
                <>{availableCount} item{pluralize(availableCount)} available to enable or install</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => setUploadOpen(true)}
            leftIcon={<Upload className="w-4 h-4" aria-hidden="true" />}
          >
            Upload App
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={handleRefresh}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger-subtle border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-2 text-danger-subtle-foreground">
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1 max-w-md">
          <Input
            type="text"
            aria-label="Search apps by name, vendor, or category"
            placeholder="Search by name, vendor, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
          />
        </div>

        <div className="md:w-44">
          <Select
            aria-label="Filter by vendor"
            placeholder="All Vendors"
            value={vendorFilter}
            onChange={setVendorFilter}
            // "All Vendors" is a real, keyboard-selectable option (not just the
            // placeholder) so the filter can be cleared from within the dropdown -
            // Select has no separate "clear" affordance once a value is chosen.
            options={[{ value: '', label: 'All Vendors' }, ...allVendors.map((v) => ({ value: v, label: v }))]}
          />
        </div>

        <div className="md:w-44">
          <Select
            aria-label="Filter by category"
            placeholder="All Categories"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[{ value: '', label: 'All Categories' }, ...allCategories.map((c) => ({ value: c, label: c }))]}
          />
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-raised text-content-secondary hover:bg-surface-hover'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          role="status"
          aria-label="Loading apps and integrations"
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} className="border border-border" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-raised border border-border rounded-lg">
          <EmptyState
            icon={<Package size={40} aria-hidden="true" />}
            title="No results found"
            description={
              search || vendorFilter || categoryFilter
                ? 'Try adjusting your search or filters.'
                : 'No apps or integrations are available yet.'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <MarketplaceCard
              key={item.key}
              item={item}
              toggling={
                (item.kind === 'app' && togglingApp === item.app?.appId) ||
                (item.kind === 'app' && uninstallingApp === item.app?.appId) ||
                (item.kind === 'marketplace' && installingMarketplace === item.marketplaceEntry?.appId)
              }
              onToggle={() => {
                if (item.kind === 'app' && item.app) handleToggle(item.app)
                else if (item.kind === 'tool' && item.tool) {
                  navigate(`/apps/${createSlug(item.tool.name)}`)
                }
              }}
              onSettings={
                item.kind === 'app' && item.app
                  ? () => setSettingsApp({ appId: item.app!.appId, name: item.app!.name })
                  : undefined
              }
              onUninstall={
                item.kind === 'app' && item.app && item.source !== 'BUILT_IN'
                  ? () => handleUninstall(item.app!)
                  : undefined
              }
              onInstall={
                item.kind === 'marketplace' && item.marketplaceEntry?.downloadUrl
                  ? () => handleInstallMarketplace(item.marketplaceEntry!)
                  : undefined
              }
              onOpen={
                item.enabled
                  ? () => {
                      if (item.kind === 'app' && item.app) {
                        navigate(`/apps/${item.app.appId}`)
                      } else if (item.kind === 'tool' && item.tool) {
                        navigate(`/apps/${createSlug(item.tool.name)}`)
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <AppUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          handleRefresh()
        }}
      />

      {/* Settings Dialog */}
      {settingsApp && (
        <AppSettingsDialog
          open={!!settingsApp}
          appId={settingsApp.appId}
          appName={settingsApp.name}
          onClose={() => setSettingsApp(null)}
          onSaved={() => {
            setSettingsApp(null)
          }}
        />
      )}
    </div>
  )
}

export default AppManagementPage

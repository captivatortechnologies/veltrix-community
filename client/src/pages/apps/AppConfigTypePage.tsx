// ========================================================================
// AppConfigTypePage — the GENERIC, manifest-driven Configuration Canvas
// authoring surface. Routed at /apps/:appId/config/:configTypeId, it lets a
// user list / create / edit / validate / (submit) / deploy configurations for
// ANY installed app's configuration type by reading that type's canvas.yaml.
//
// ZERO app-specific code: every literal is derived from the route params
// (appId / configTypeId) and the manifest / canvas template. It reuses the
// shared ConfigurationCanvas + configurationCanvasApi verbatim and renders
// inside the same branded AppShell as the app's bundle pages.
// ========================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileText,
  Edit2,
  Copy,
  Trash2,
  Send,
  ArrowLeft,
  CheckCircle2,
  Rocket,
  Layers,
  ShieldCheck,
  GitPullRequest,
  Ticket,
} from 'lucide-react'
import {
  ConfigurationCanvas,
  configurationCanvasApi,
  ApprovalSubmissionDialog,
} from '@/components/shared/ConfigurationCanvas'
import type {
  ConfigSection,
  CanvasExportData,
  ConfigurationCanvasListItem,
  ConfigCanvasStatus,
  ApprovalSubmissionData,
} from '@/components/shared/ConfigurationCanvas'
import { useApps } from '../../contexts/AppContext'
import { appService } from '../../services/appService'
import { getUser } from '../../services/authService'
import { useToast } from '../../components/shared/Toast'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { AppShell, buildAppNavItems } from './AppShell'
import { AppBundleTab } from './AppBundleTab'
import type { AppPageDeclaration } from '../../../../shared/types/app'
import { FilterBar, SortSelect, Pagination } from '@/components/shared'
import { ReviewsDrawer } from './reviews/ReviewsDrawer'
import { ConfigDetailsModal } from './ConfigDetailsModal'
import {
  canvasTemplateToItems,
  fetchCanvasTemplate,
  fetchCanvasDefaults,
  makeCanvasItem,
  resolveItemSpec,
  type CanvasTemplate,
  type CanvasDefaults,
} from './canvasTemplate'
import {
  validateCanvas,
  deployCanvas,
  pollDeployment,
  fetchComponents,
  fetchTags,
  fetchUsers,
  type CanvasValidationResult,
  type PlatformComponent,
  type PlatformTag,
} from './appConfigResources'

// ---------------------------------------------------------------------------
// Status presentation (generic — covers the full ConfigCanvasStatus union)
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  VALIDATION_PENDING: 'Validating',
  VALIDATION_FAILED: 'Validation failed',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  DEPLOYMENT_QUEUED: 'Queued',
  DEPLOYING: 'Deploying',
  DEPLOYMENT_PAUSED: 'Paused',
  DEPLOYED: 'Deployed',
  DEPLOYMENT_FAILED: 'Deploy failed',
  ROLLED_BACK: 'Rolled back',
  ARCHIVED: 'Archived',
  CHANGES_REQUESTED: 'Changes requested',
}

function statusBadgeClass(status: ConfigCanvasStatus): string {
  switch (status) {
    case 'APPROVED':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    case 'PENDING_APPROVAL':
    case 'VALIDATION_PENDING':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'CHANGES_REQUESTED':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
    case 'DEPLOYED':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    case 'DEPLOYING':
    case 'DEPLOYMENT_QUEUED':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
    case 'VALIDATION_FAILED':
    case 'DEPLOYMENT_FAILED':
    case 'ROLLED_BACK':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }
}

const StatusBadge: React.FC<{ status: ConfigCanvasStatus }> = ({ status }) => (
  <span
    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusBadgeClass(status)}`}
  >
    {STATUS_LABEL[status] ?? status}
  </span>
)

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const CenteredSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-24" role="status" aria-label={label}>
    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{label}</p>
  </div>
)

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mx-auto mt-16 max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
    <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">{children}</div>
  </div>
)

// ---------------------------------------------------------------------------
// Validation results — inline errors/warnings from the pipeline validate call.
// ---------------------------------------------------------------------------

const ValidationResultsPanel: React.FC<{
  configName: string
  result: CanvasValidationResult
  onDismiss: () => void
}> = ({ configName, result, onDismiss }) => {
  const tone = result.valid
    ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
    : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {result.valid ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          )}
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {result.valid ? 'Validation passed' : 'Validation found issues'} — {configName}
          </h4>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Dismiss validation results"
        >
          &times;
        </button>
      </div>
      {result.errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {result.errors.map((e, i) => (
            <li key={`err-${i}`} className="text-sm text-red-700 dark:text-red-300">
              {e.field ? <span className="font-medium">{e.field}: </span> : null}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {result.warnings.map((w, i) => (
            <li key={`warn-${i}`} className="text-sm text-yellow-700 dark:text-yellow-300">
              {w.field ? <span className="font-medium">{w.field}: </span> : null}
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Configuration-type tabs
//
// A configuration type can declare companion pages in its manifest — app
// pages with `nav: 'tab'` and `parent: '/config/<typeId>'` (e.g. an "Index
// Defaults" page under the Indexes type). They render as in-page tabs beside
// the always-present "Configurations" tab (the canvas authoring list), driven
// entirely by the manifest — no app-specific code here. The active tab is
// tracked in the URL (`?tab=<slug>`) so it deep-links and survives refresh.
// ---------------------------------------------------------------------------

const CONFIG_TAB_SLUG = 'configurations'

interface ConfigTypeTab {
  slug: string
  label: string
  /** The companion app page for this tab; undefined for the Configurations tab. */
  page?: AppPageDeclaration
}

/** A stable URL slug for a companion page (its path without the leading slash). */
function companionPageSlug(page: AppPageDeclaration): string {
  return page.path.replace(/^\/+/, '')
}

const ConfigTypeTabStrip: React.FC<{
  tabs: ConfigTypeTab[]
  activeSlug: string
  onSelect: (slug: string) => void
}> = ({ tabs, activeSlug, onSelect }) => (
  <div
    role="tablist"
    aria-label="Configuration views"
    className="flex items-stretch gap-1 border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800 sm:px-6"
  >
    {tabs.map((tab) => {
      const active = tab.slug === activeSlug
      return (
        <button
          key={tab.slug}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onSelect(tab.slug)}
          className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${
            active
              ? 'text-gray-900 dark:text-gray-100'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
          style={active ? { borderBottomColor: 'var(--veltrix-app-primary)' } : undefined}
        >
          {tab.label}
        </button>
      )
    })}
  </div>
)

// ---------------------------------------------------------------------------
// AppConfigTypePage
// ---------------------------------------------------------------------------

type ViewMode = 'list' | 'create' | 'edit'

const EMPTY_PALETTE = { categories: [] as [] }

const AppConfigTypeSurface: React.FC = () => {
  const { appId = '', configTypeId = '' } = useParams<{ appId: string; configTypeId: string }>()
  const { enabledApps, loading: appsLoading } = useApps()
  const app = enabledApps.find((candidate) => candidate.appId === appId)
  const configType = app?.configurationTypes.find((ct) => ct.id === configTypeId)
  const ready = Boolean(app && configType)

  const toast = useToast()
  const { confirm } = useConfirmDialog()

  // Signed-in user (from storage) — decides which reviewer controls appear in the drawer.
  const currentUserId = useMemo(() => {
    const u = getUser()
    return u ? String(u.id) : undefined
  }, [])

  // Companion tabs for this configuration type (manifest pages with
  // `nav: 'tab'` + `parent: '/config/<typeId>'`), plus the always-present
  // "Configurations" tab. The active tab lives in the URL (`?tab=<slug>`).
  const [searchParams, setSearchParams] = useSearchParams()
  const companionPages = useMemo<AppPageDeclaration[]>(() => {
    const parentPath = `/config/${configTypeId}`
    return (app?.pages ?? [])
      .filter((p) => p.nav === 'tab' && p.parent === parentPath)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label))
  }, [app, configTypeId])
  const tabs = useMemo<ConfigTypeTab[]>(
    () => [
      { slug: CONFIG_TAB_SLUG, label: 'Configurations' },
      ...companionPages.map((p) => ({ slug: companionPageSlug(p), label: p.label, page: p })),
    ],
    [companionPages],
  )
  const requestedTab = searchParams.get('tab') ?? CONFIG_TAB_SLUG
  const activeTabSlug = tabs.some((t) => t.slug === requestedTab) ? requestedTab : CONFIG_TAB_SLUG
  const activeCompanion = companionPages.find((p) => companionPageSlug(p) === activeTabSlug)
  const selectTab = useCallback(
    (slug: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (slug === CONFIG_TAB_SLUG) next.delete('tab')
          else next.set('tab', slug)
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [configurations, setConfigurations] = useState<ConfigurationCanvasListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editor state
  const [selectedConfig, setSelectedConfig] = useState<ConfigurationCanvasListItem | null>(null)
  const [initialSections, setInitialSections] = useState<ConfigSection[]>([])
  const [configName, setConfigName] = useState('')
  const [editorLoading, setEditorLoading] = useState(false)

  // Tags / environments
  const [availableTags, setAvailableTags] = useState<PlatformTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  // Connections
  const [componentTypes, setComponentTypes] = useState<string[]>([])
  const [components, setComponents] = useState<PlatformComponent[]>([])

  // Canvas template + defaults — drives the item spec (itemLabel / identityField /
  // repeatable / minItems / maxItems) and the `createItem` factory passed to
  // ConfigurationCanvas so its "Add <itemLabel>" / duplicate / remove actions work for
  // BOTH the "New configuration" flow and an already-loaded, existing configuration.
  const [canvasTemplate, setCanvasTemplate] = useState<CanvasTemplate | null>(null)
  const [canvasDefaults, setCanvasDefaults] = useState<CanvasDefaults | undefined>(undefined)

  // Per-config async actions
  const [busy, setBusy] = useState<{ id: string; action: 'validate' | 'deploy' | 'duplicate' } | null>(
    null,
  )
  const [validation, setValidation] = useState<{
    configId: string
    configName: string
    result: CanvasValidationResult
  } | null>(null)

  // Approval dialog
  const [approvalConfig, setApprovalConfig] = useState<ConfigurationCanvasListItem | null>(null)

  // Reviews drawer (GitHub-PR-style review surface) + per-config approval summaries.
  const [reviewsConfig, setReviewsConfig] = useState<ConfigurationCanvasListItem | null>(null)
  // Read-only details modal (opened by clicking a config's name).
  const [detailsConfig, setDetailsConfig] = useState<ConfigurationCanvasListItem | null>(null)
  const [approvalSummaries, setApprovalSummaries] = useState<
    Record<string, { approved: number; total: number }>
  >({})

  // --- Data loading -------------------------------------------------------

  const fetchConfigurations = useCallback(async () => {
    if (!ready) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await configurationCanvasApi.getAll({ toolType: appId, entityType: configTypeId })
      setConfigurations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configurations')
    } finally {
      setIsLoading(false)
    }
  }, [ready, appId, configTypeId])

  useEffect(() => {
    void fetchConfigurations()
  }, [fetchConfigurations])

  // Lazily load "Approved X/Y" summaries for configs in a review-relevant status so the
  // deploy affordance can surface progress without weighing down the list fetch.
  useEffect(() => {
    const relevant = configurations.filter(
      (c) =>
        c.status === 'PENDING_APPROVAL' ||
        c.status === 'APPROVED' ||
        c.status === 'CHANGES_REQUESTED',
    )
    if (relevant.length === 0) {
      setApprovalSummaries({})
      return
    }
    let active = true
    void Promise.all(
      relevant.map((c) =>
        configurationCanvasApi
          .getApprovals(c.id)
          .then(
            (a) => [c.id, { approved: a.summary.approved, total: a.summary.total }] as const,
          )
          .catch(() => null),
      ),
    ).then((entries) => {
      if (!active) return
      const map: Record<string, { approved: number; total: number }> = {}
      for (const entry of entries) {
        if (entry) map[entry[0]] = entry[1]
      }
      setApprovalSummaries(map)
    })
    return () => {
      active = false
    }
  }, [configurations])

  // Tags + components + the config type's target componentTypes (from app detail).
  useEffect(() => {
    if (!ready) return
    let active = true
    void fetchTags().then((t) => {
      if (active) setAvailableTags(t)
    })
    void fetchComponents().then((c) => {
      if (active) setComponents(c)
    })
    appService
      .getAppDetail(appId)
      .then((detail) => {
        if (!active) return
        const ct = detail.configurationTypes.find((c) => c.id === configTypeId)
        setComponentTypes(ct?.componentTypes ?? [])
      })
      .catch(() => {
        if (active) setComponentTypes([])
      })
    return () => {
      active = false
    }
  }, [ready, appId, configTypeId])

  // Eagerly load the canvas template + defaults whenever the page is ready, independent
  // of the create/edit flows (handleCreate fetches its own copy too, to seed the very
  // first render; this covers Add/Duplicate item support once an EXISTING configuration
  // is opened for editing, without changing how handleEdit loads its sections).
  useEffect(() => {
    if (!ready) return
    let active = true
    void Promise.all([fetchCanvasTemplate(appId, configTypeId), fetchCanvasDefaults(appId, configTypeId)])
      .then(([template, defaults]) => {
        if (!active) return
        setCanvasTemplate(template)
        setCanvasDefaults(defaults)
      })
      .catch(() => {
        // No canvas template for this configuration type (or it failed to load) — the
        // Add/Duplicate item actions simply stay unavailable; list/CRUD is unaffected.
      })
    return () => {
      active = false
    }
  }, [ready, appId, configTypeId])

  // Item factory for Add / Duplicate. Its fallback numbering ("Index 2", "Index 3", …)
  // tracks the item count of whatever is currently loaded into the editor — see the
  // effect below — since ConfigurationCanvas owns the live section list internally and
  // always re-indexes `order` on insert regardless of what this returns.
  const nextItemOrderRef = useRef(0)
  useEffect(() => {
    nextItemOrderRef.current = initialSections.length
  }, [initialSections])

  const itemSpec = useMemo(() => resolveItemSpec(canvasTemplate), [canvasTemplate])

  const createItem = useCallback(
    (seed?: Record<string, unknown>): ConfigSection => {
      const order = nextItemOrderRef.current
      nextItemOrderRef.current += 1
      // customerDefaults: undefined for now — a tenant-defaults source (the app's own
      // "Index Defaults") is a later step; the parameter is already plumbed through
      // makeCanvasItem so wiring one in later is a one-line change.
      return makeCanvasItem(canvasTemplate, {
        defaults: canvasDefaults,
        customerDefaults: undefined,
        seed,
        order,
      })
    },
    [canvasTemplate, canvasDefaults],
  )

  const matchingComponents = useMemo(
    () =>
      componentTypes.length === 0
        ? []
        : components.filter((c) =>
            componentTypes.some((ct) => String(c.type ?? '').includes(ct)),
          ),
    [components, componentTypes],
  )

  // --- Search / filter / sort / pagination over the configuration list --------
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [envFilter, setEnvFilter] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'name' | 'status' | 'version' | 'updatedAt'>('updatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const statusFilterOptions = useMemo(
    () =>
      Array.from(new Set(configurations.map((c) => c.status))).map((s) => ({
        value: s,
        label: STATUS_LABEL[s] ?? s,
      })),
    [configurations],
  )
  const envFilterOptions = useMemo(
    () => availableTags.map((t) => ({ value: t.id, label: t.name })),
    [availableTags],
  )
  const sortOptions = useMemo(
    () => [
      { value: 'name', label: 'Name' },
      { value: 'status', label: 'Status' },
      { value: 'version', label: 'Version' },
      { value: 'updatedAt', label: 'Updated' },
    ],
    [],
  )

  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = configurations
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter) rows = rows.filter((c) => c.status === statusFilter)
    if (envFilter) rows = rows.filter((c) => (c.tags ?? []).some((t) => t.tagId === envFilter))
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      let av: string | number
      let bv: string | number
      switch (sortField) {
        case 'name':
          av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break
        case 'status':
          av = a.status; bv = b.status; break
        case 'version':
          av = a.version; bv = b.version; break
        default:
          av = new Date(a.updatedAt).getTime(); bv = new Date(b.updatedAt).getTime()
      }
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [configurations, search, statusFilter, envFilter, sortField, sortDir])

  const pageConfigs = useMemo(
    () => filteredConfigs.slice((page - 1) * pageSize, page * pageSize),
    [filteredConfigs, page, pageSize],
  )

  // Snap back to page 1 whenever the result set changes shape.
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, envFilter, sortField, sortDir])


  // --- Editor navigation --------------------------------------------------

  const resetEditor = useCallback(() => {
    setSelectedConfig(null)
    setInitialSections([])
    setConfigName('')
    setSelectedTagIds([])
  }, [])

  const handleCreate = useCallback(async () => {
    setError(null)
    setValidation(null)
    setEditorLoading(true)
    setSelectedConfig(null)
    setConfigName(`New ${configType?.name ?? 'configuration'}`)
    setSelectedTagIds([])
    setInitialSections([])
    setViewMode('create')
    try {
      const [template, defaults] = await Promise.all([
        fetchCanvasTemplate(appId, configTypeId),
        fetchCanvasDefaults(appId, configTypeId),
      ])
      setCanvasTemplate(template)
      setCanvasDefaults(defaults)
      // customerDefaults: undefined for now — see the createItem factory above.
      setInitialSections(canvasTemplateToItems(template, defaults, undefined))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load canvas template'
      setError(msg)
      toast.error(msg)
      setViewMode('list')
    } finally {
      setEditorLoading(false)
    }
  }, [appId, configTypeId, configType, toast])

  const handleEdit = useCallback(
    async (config: ConfigurationCanvasListItem) => {
      setError(null)
      setValidation(null)
      setEditorLoading(true)
      setSelectedConfig(config)
      setConfigName(config.name)
      setInitialSections([])
      setViewMode('edit')
      try {
        const full = await configurationCanvasApi.getById(config.id)
        setConfigName(full.name)
        setInitialSections(configurationCanvasApi.sectionsFromApi(full.sections))
        setSelectedTagIds(full.tags?.map((t) => t.tagId) ?? [])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load configuration'
        setError(msg)
        toast.error(msg)
        setViewMode('list')
      } finally {
        setEditorLoading(false)
      }
    },
    [toast],
  )

  const handleCancelEditor = useCallback(() => {
    setViewMode('list')
    resetEditor()
  }, [resetEditor])

  const handleSave = useCallback(
    async (data: CanvasExportData) => {
      setError(null)
      const tagIdsToSave = data.tagIds ?? selectedTagIds
      try {
        if (selectedConfig) {
          await configurationCanvasApi.update(
            selectedConfig.id,
            { name: configName || data.name, description: data.description, tagIds: tagIdsToSave },
            data.sections,
          )
          toast.success('Configuration updated.')
        } else {
          await configurationCanvasApi.create(
            {
              name: configName || data.name,
              description: data.description,
              toolType: appId,
              entityType: configTypeId,
              tagIds: tagIdsToSave,
            },
            data.sections,
          )
          toast.success('Configuration created.')
        }
        await fetchConfigurations()
        setViewMode('list')
        resetEditor()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save configuration'
        setError(msg)
        toast.error(msg)
      }
    },
    [selectedConfig, configName, appId, configTypeId, selectedTagIds, toast, fetchConfigurations, resetEditor],
  )

  // --- Per-config actions -------------------------------------------------

  const handleDuplicate = useCallback(
    async (config: ConfigurationCanvasListItem) => {
      setBusy({ id: config.id, action: 'duplicate' })
      try {
        await configurationCanvasApi.duplicate(config.id, `${config.name} (Copy)`)
        toast.success(`"${config.name}" duplicated.`)
        await fetchConfigurations()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to duplicate configuration')
      } finally {
        setBusy(null)
      }
    },
    [toast, fetchConfigurations],
  )

  const handleDelete = useCallback(
    async (config: ConfigurationCanvasListItem) => {
      const confirmed = await confirm({
        title: 'Delete configuration',
        message: `Delete "${config.name}"? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger',
      })
      if (!confirmed) return
      try {
        await configurationCanvasApi.delete(config.id)
        setConfigurations((prev) => prev.filter((c) => c.id !== config.id))
        toast.success('Configuration deleted.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete configuration')
      }
    },
    [confirm, toast],
  )

  const handleValidate = useCallback(
    async (config: ConfigurationCanvasListItem) => {
      setBusy({ id: config.id, action: 'validate' })
      try {
        const result = await validateCanvas(config.id)
        setValidation({ configId: config.id, configName: config.name, result })
        if (result.valid) toast.success('Validation passed.')
        else toast.error(`Validation found ${result.errors.length} issue(s).`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Validation failed')
      } finally {
        setBusy(null)
      }
    },
    [toast],
  )

  const handleDeploy = useCallback(
    async (config: ConfigurationCanvasListItem) => {
      const environmentId = config.tags?.[0]?.tagId
      if (!environmentId) {
        toast.error('Assign an environment before deploying.')
        return
      }
      setBusy({ id: config.id, action: 'deploy' })
      try {
        const { deploymentId } = await deployCanvas(config.id, environmentId)
        toast.info('Deployment started…')
        const status = await pollDeployment(deploymentId)
        if (status?.status === 'DEPLOYED') toast.success('Deployment succeeded.')
        else if (status) toast.error(`Deployment ${(STATUS_LABEL[status.status] ?? status.status).toLowerCase()}.`)
        await fetchConfigurations()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Deployment failed')
      } finally {
        setBusy(null)
      }
    },
    [toast, fetchConfigurations],
  )

  const handleApprovalSubmit = useCallback(
    async (data: ApprovalSubmissionData) => {
      if (!approvalConfig) return
      await configurationCanvasApi.submitForApproval(
        approvalConfig.id,
        data.approverIds,
        data.environmentIds || [],
        data.comment,
      )
      toast.success(`"${approvalConfig.name}" submitted for approval.`)
      await fetchConfigurations()
      setApprovalConfig(null)
    },
    [approvalConfig, toast, fetchConfigurations],
  )

  // Opens the read-only details modal focused on its "Change / Issue tickets"
  // section — the ticket list/create/link UI lives inline there (TicketLinkPanel),
  // so there's no separate action to perform here (mirrors handleDeploy's shape).
  const handleLinkTicket = useCallback((config: ConfigurationCanvasListItem) => {
    setDetailsConfig(config)
  }, [])

  // Deploy prerequisites (generic — approval + environment + a matching connection).
  const deployBlockedReason = useCallback(
    (config: ConfigurationCanvasListItem): string | null => {
      // APPROVED deploys normally; DEPLOYMENT_FAILED / ROLLED_BACK can be retried
      // as-is. Editing the config resets it to DRAFT and forces re-approval.
      const retryable = config.status === 'DEPLOYMENT_FAILED' || config.status === 'ROLLED_BACK'
      if (config.status !== 'APPROVED' && !retryable) return 'Approve this configuration to deploy'
      if (!config.tags?.[0]?.tagId) return 'Assign an environment to deploy'
      if (matchingComponents.length === 0) {
        const target = componentTypes.length > 0 ? componentTypes.join('/') : 'target'
        return `Register a ${target} connection to deploy`
      }
      return null
    },
    [matchingComponents.length, componentTypes],
  )

  // --- Resolution states, cheapest first ----------------------------------

  if (appsLoading && !app) {
    return <CenteredSpinner label="Loading apps…" />
  }

  if (!app) {
    return (
      <Panel title="App not available">
        <p>{`"${appId}" is not enabled for your organization, or it does not exist.`}</p>
        <p className="mt-2">
          <Link to="/marketplace" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Manage apps
          </Link>
        </p>
      </Panel>
    )
  }

  const navItems = buildAppNavItems(app)
  const activePath = `/config/${configTypeId}`

  if (!configType) {
    return (
      <AppShell app={app} navItems={navItems} activePath={activePath}>
        <Panel title="Configuration type not found">
          <p>{`"${app.name}" has no configuration type "${configTypeId}".`}</p>
          <p className="mt-2">
            <Link
              to={`/apps/${app.appId}`}
              className="text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Back to {app.name}
            </Link>
          </p>
        </Panel>
      </AppShell>
    )
  }

  // --- Companion tab view (e.g. "Defaults") -------------------------------
  // A manifest-declared companion page for this configuration type. Rendered
  // beside the "Configurations" tab; its body is the app's own bundle page.
  if (activeCompanion) {
    return (
      <AppShell app={app} navItems={navItems} activePath={activePath}>
        <ConfigTypeTabStrip tabs={tabs} activeSlug={activeTabSlug} onSelect={selectTab} />
        <AppBundleTab app={app} page={activeCompanion} />
      </AppShell>
    )
  }

  // --- Editor view --------------------------------------------------------

  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <AppShell app={app} navItems={navItems} activePath={activePath}>
        <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <button
            onClick={handleCancelEditor}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {configType.name}
          </button>
        </div>
        {editorLoading ? (
          <CenteredSpinner label="Loading canvas…" />
        ) : (
          <ConfigurationCanvas
            initialSections={initialSections}
            palette={EMPTY_PALETTE}
            showPalette={false}
            canvasId={selectedConfig?.id}
            toolType={appId}
            entityType={configTypeId}
            title={viewMode === 'create' ? `New ${configType.name}` : `Edit ${configType.name}`}
            configName={configName}
            onConfigNameChange={setConfigName}
            onSave={handleSave}
            onCancel={handleCancelEditor}
            readOnly={false}
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            onTagsChange={setSelectedTagIds}
            createItem={canvasTemplate ? createItem : undefined}
            itemLabel={itemSpec.label}
            identityField={itemSpec.identityField}
            repeatable={itemSpec.repeatable}
            minItems={itemSpec.minItems}
            maxItems={itemSpec.maxItems}
          />
        )}
      </AppShell>
    )
  }

  // --- List view ----------------------------------------------------------

  return (
    <AppShell app={app} navItems={navItems} activePath={activePath}>
      {companionPages.length > 0 && (
        <ConfigTypeTabStrip tabs={tabs} activeSlug={activeTabSlug} onSelect={selectTab} />
      )}
      <div className="space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{configType.name}</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create and manage {configType.name} configurations for {app.name}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchConfigurations()}
              disabled={isLoading}
              title="Refresh"
              className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => void handleCreate()}
              style={{ backgroundColor: 'var(--veltrix-app-primary)' }}
              className="flex items-center gap-2 rounded-md px-4 py-2 font-medium text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New configuration
            </button>
          </div>
        </div>

        {/* Validation results */}
        {validation && (
          <ValidationResultsPanel
            configName={validation.configName}
            result={validation.result}
            onDismiss={() => setValidation(null)}
          />
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Search / filter / sort toolbar */}
        {!isLoading && configurations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterBar
              search={{
                value: search,
                onChange: setSearch,
                placeholder: `Search ${configType.name}…`,
              }}
              filters={[
                {
                  key: 'status',
                  label: 'Status',
                  options: statusFilterOptions,
                  value: statusFilter,
                  onChange: setStatusFilter,
                  alwaysVisible: true,
                },
                {
                  key: 'environment',
                  label: 'Environment',
                  options: envFilterOptions,
                  value: envFilter,
                  onChange: setEnvFilter,
                },
              ]}
              onClearAll={() => {
                setSearch('')
                setStatusFilter(null)
                setEnvFilter(null)
              }}
            />
            <SortSelect
              options={sortOptions}
              value={sortField}
              direction={sortDir}
              onChange={(value, direction) => {
                setSortField(value as typeof sortField)
                setSortDir(direction)
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          {isLoading ? (
            <CenteredSpinner label="Loading configurations…" />
          ) : configurations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                <Layers className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                No {configType.name} configurations yet
              </h3>
              <p className="mb-6 max-w-md text-sm text-gray-500 dark:text-gray-400">
                No {configType.name} configurations yet — create one.
              </p>
              <button
                onClick={() => void handleCreate()}
                style={{ backgroundColor: 'var(--veltrix-app-primary)' }}
                className="flex items-center gap-2 rounded-md px-4 py-2 font-medium text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Create your first configuration
              </button>
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No {configType.name} configurations match your search or filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Version
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Updated
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {pageConfigs.map((config) => {
                    const rowBusy = busy?.id === config.id
                    const blockedReason = deployBlockedReason(config)
                    return (
                      <tr key={config.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                              <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => setDetailsConfig(config)}
                                className="text-left font-medium text-gray-900 hover:text-indigo-600 hover:underline dark:text-white dark:hover:text-indigo-400"
                              >
                                {config.name}
                              </button>
                              {config.description && (
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {config.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={config.status} />
                          {approvalSummaries[config.id] && (
                            <div className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                              Approved {approvalSummaries[config.id].approved}/
                              {approvalSummaries[config.id].total}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                          v{config.version}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                          {new Date(config.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => void handleValidate(config)}
                              disabled={rowBusy}
                              title="Validate"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                            >
                              {rowBusy && busy?.action === 'validate' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => void handleEdit(config)}
                              title="Edit"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => void handleDuplicate(config)}
                              disabled={rowBusy}
                              title="Duplicate"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-green-400"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setReviewsConfig(config)}
                              title="Reviews & comments"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                            >
                              <GitPullRequest className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleLinkTicket(config)}
                              title="Change / issue tickets"
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                            >
                              <Ticket className="h-4 w-4" />
                            </button>
                            {config.status === 'DRAFT' && (
                              <button
                                onClick={() => setApprovalConfig(config)}
                                title="Submit for approval"
                                className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-orange-400"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => void handleDeploy(config)}
                              disabled={!!blockedReason || rowBusy}
                              title={
                                approvalSummaries[config.id]
                                  ? `${blockedReason ?? 'Deploy'} · Approved ${approvalSummaries[config.id].approved}/${approvalSummaries[config.id].total}`
                                  : blockedReason ?? 'Deploy'
                              }
                              aria-disabled={!!blockedReason || rowBusy}
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-indigo-400"
                            >
                              {rowBusy && busy?.action === 'deploy' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Rocket className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => void handleDelete(config)}
                              disabled={config.status !== 'DRAFT'}
                              title={config.status === 'DRAFT' ? 'Delete' : 'Only drafts can be deleted'}
                              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && filteredConfigs.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={filteredConfigs.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}

        {/* Deploy prerequisites hint */}
        <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Deployment requires an approved configuration, an assigned environment, and a registered
            connection. Validate early and submit for approval when ready.
          </span>
        </div>
      </div>

      {/* Approval submission dialog (shared platform component) */}
      <ApprovalSubmissionDialog
        isOpen={approvalConfig !== null}
        onClose={() => setApprovalConfig(null)}
        onSubmit={handleApprovalSubmit}
        configName={approvalConfig?.name ?? ''}
        fetchUsers={fetchUsers}
        fetchTags={fetchTags}
        initialSelectedEnvironments={approvalConfig?.tags?.map((t) => t.tagId) ?? []}
      />

      {/* Reviews drawer (GitHub-PR-style review pipeline) */}
      {reviewsConfig && (
        <ReviewsDrawer
          config={reviewsConfig}
          currentUserId={currentUserId}
          fetchUsers={fetchUsers}
          fetchTags={fetchTags}
          onClose={() => setReviewsConfig(null)}
          onChanged={() => void fetchConfigurations()}
        />
      )}

      {/* Read-only details modal with the same row actions in its footer. */}
      <ConfigDetailsModal
        config={detailsConfig}
        onClose={() => setDetailsConfig(null)}
        onValidate={handleValidate}
        onEdit={handleEdit}
        onDuplicate={handleDuplicate}
        onDeploy={handleDeploy}
        onDelete={handleDelete}
        onReviews={setReviewsConfig}
        onSubmitApproval={setApprovalConfig}
        onLinkTicket={handleLinkTicket}
        deployBlockedReason={deployBlockedReason}
      />
    </AppShell>
  )
}

/**
 * Switching config type only changes a route param, so React keeps the same
 * component mounted and its state — including an open canvas editor — survives.
 * Clicking "Config Files" while the "Apps" form was open would leave that form
 * on screen instead of showing the Config Files list.
 *
 * Key the surface on the config type so it remounts, rather than hand-resetting
 * each piece of editor state (which silently rots as state is added).
 */
const AppConfigTypePage: React.FC = () => {
  const { appId = '', configTypeId = '' } = useParams<{ appId: string; configTypeId: string }>()
  return <AppConfigTypeSurface key={`${appId}/${configTypeId}`} />
}

export default AppConfigTypePage

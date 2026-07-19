// ========================================================================
// Host runtime installer — the platform side of the app-client contract.
//
// Marketplace app client bundles are ESM whose `react`, `react-dom`,
// `react/jsx-runtime` and `@veltrixsecops/app-sdk/*` imports were
// compile-time replaced with shims that read the runtime object this module
// installs on `globalThis.__VELTRIX_APP_RUNTIME__`. That guarantees a
// single React instance per page and gives app pages the shared AppContext,
// an authenticated fetch, and (via `runtime.ui`) the platform's real shared
// component library — see @veltrixsecops/app-sdk/ui, which delegates every
// component it exports to `runtime.ui.<Name>` at render time.
//
// This module MUST be imported first in main.tsx (it installs the global at
// import time), before any code path that could dynamically import an app
// bundle. The SDK surface here intentionally mirrors — but does not import —
// @veltrixsecops/app-sdk: the npm SDK is never a client dependency.
//
// Contract v2 (Wave C4, RBAC/IdP hardening 2026-07-10): both
// `VeltrixHostRuntime` and `AppContextValue` gained a `permissions` member —
// `{ has(resource, action, opts?), list() }` — backed by the C1 permission
// store (stores/permissionStore.ts, the exact client mirror of
// server/src/lib/permissions.ts's matching semantics). On `AppContextValue`
// (built per-page in AppPageHost.tsx) `has()` defaults `opts.appId` to the
// CURRENT app's own id — an app checks its OWN declared resources by
// default; pass `opts.appId` explicitly to check a different app or the
// platform (`appId: null`). On the top-level `VeltrixHostRuntime.permissions`
// there is no such default (platform-scoped unless `opts.appId` is passed) —
// use `useContext(AppContext).permissions` from app page code instead. The
// SDK's own TypeScript typings for this surface live in the external
// `veltrix-apps` repo (`sdk/src/hooks/use-app-context.ts`,
// `sdk/src/client/index.ts`, `sdk/src/hooks/use-permissions.ts`).
// ========================================================================

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Textarea,
  Checkbox,
  Select,
  MultiSelect,
  SearchBox,
  Pagination,
  FilterBar,
  SortSelect,
  FormField,
  Tabs,
  DataTable,
  StatsCard,
  FormDialog,
  Modal,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  Tooltip,
  Spinner,
} from '../components/shared'
import { useToast } from '../components/shared/Toast'
import { useConfirmDialog } from '../components/shared/ConfirmationDialog'
import {
  usePermissionStore,
  type PermissionEntry,
  type PermissionCheckOptions,
} from '../stores/permissionStore'

/** Name of the global installed for app bundles (fixed by the SDK contract). */
export const HOST_RUNTIME_GLOBAL = '__VELTRIX_APP_RUNTIME__'

// ---------------------------------------------------------------------------
// Contract types (structural mirrors of @veltrixsecops/app-sdk — kept local
// on purpose; runtime data comes from platform JSON APIs).
// ---------------------------------------------------------------------------

/**
 * Minimal structural user shape apps can rely on. The host passes its full
 * stored user object, so extra platform fields (role, firstName, ...) are
 * present at runtime even though the contract only promises these.
 */
export interface AppContextUser {
  id: string | number
  email: string
  name?: string | null
  customerId: string
}

/**
 * The app's brand identity, mirroring the SDK's AppBrandingDeclaration —
 * except that `logo`/`logoDark` are RESOLVED platform URLs (served by
 * /api/apps/:appId/branding/logo*), not the manifest's repo-relative paths.
 */
export interface AppBranding {
  primaryColor?: string
  accentColor?: string
  logo?: string
  logoDark?: string
}

/**
 * The permission-check surface exposed on `AppContextValue` and
 * `VeltrixHostRuntime` (Wave C4, RBAC/IdP hardening 2026-07-10). Backed by
 * the C1 permission store (`stores/permissionStore.ts`); mirrors the
 * server's matching semantics exactly (`all:all`, `resource:all`, appId
 * scoping, platform-admin bypass — see `server/src/lib/permissions.ts`).
 */
export interface AppPermissionsApi {
  /** Fail-closed: `false` for anything not explicitly granted. */
  has: (resource: string, action: string, opts?: PermissionCheckOptions) => boolean
  list: () => PermissionEntry[]
}

export interface AppContextValue {
  appId: string
  customerId: string
  user: AppContextUser | null
  customer: Record<string, unknown> | null

  // Platform data accessors
  getComponents: () => Promise<Array<Record<string, unknown>>>
  getCredentials: () => Promise<Array<Record<string, unknown>>>
  getTags: () => Promise<Array<Record<string, unknown>>>

  // App settings (key -> value)
  settings: Record<string, unknown>

  /** The app's manifest branding, resolved by the platform (null when unset). */
  branding?: AppBranding | null

  /**
   * Permission checks for THIS app. `has(resource, action)` (no `opts`)
   * checks the app's OWN declared resources by default — `opts.appId`
   * defaults to this context's `appId`; pass an explicit `opts.appId` to
   * check a different app or `null` for a platform resource.
   */
  permissions: AppPermissionsApi
}

export interface PipelineStatusData {
  pendingApprovals: number
  activeDeployments: number
  failedDeployments: number
  unresolvedDrifts: number
  recentDeployments: Array<{
    id: string
    canvasName: string
    environment: string
    status: string
    startedAt: string
    completedAt?: string
  }>
}

export interface VeltrixHostRuntime {
  /** The host's `react` module object. */
  react: unknown
  /** The host's `react-dom` module object. */
  reactDom: unknown
  /** The host's `react-dom/client` module object. */
  reactDomClient: unknown
  /** The host's `react/jsx-runtime` module object. */
  jsxRuntime: unknown
  /** Shared app context — the host wraps app pages in its Provider. */
  AppContext: React.Context<AppContextValue | null>
  /** fetch() with the platform's Authorization header attached. */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>
  /** SDK surface app bundles receive for `@veltrixsecops/app-sdk/*` imports. */
  sdk: Record<string, unknown>
  /**
   * The platform's real `components/shared/*` implementations, keyed by
   * component name: `Button`, `Input`, `Textarea`, `Checkbox`, `Select`,
   * `SearchBox`, `Pagination`, `FilterBar`, `SortSelect`, `Card`,
   * `CardHeader`, `CardBody`, `CardFooter`, `Badge`, `Tooltip`,
   * `EmptyState`, `Skeleton`, `SkeletonText`, `SkeletonCard`, `DataTable`,
   * `StatsCard`, `FormDialog`, `FormField`, `Tabs`, `Spinner` — plus the two
   * context hooks `useToast` and `useConfirmDialog` (whose host-mounted
   * providers AppShell wraps around every app subtree). Backs
   * `@veltrixsecops/app-sdk/ui` — each SDK `/ui` export delegates to
   * `runtime.ui.<Name>` and falls back to a minimal accessible element when a
   * key is absent (older host, or running outside the platform).
   */
  ui: Record<string, unknown>
  /**
   * Platform-scoped permission checks (Wave C4) — `opts.appId` is NOT
   * defaulted here (omit it for a platform-scoped check, or pass an explicit
   * appId). App page code should prefer `useContext(AppContext).permissions`
   * instead, which defaults `opts.appId` to the app's own id.
   */
  permissions: AppPermissionsApi
}

// ---------------------------------------------------------------------------
// Shared context — created exactly ONCE by the host so every app bundle (and
// AppPageHost's Provider) sees the same context object.
// ---------------------------------------------------------------------------

export const AppContext = React.createContext<AppContextValue | null>(null)

// ---------------------------------------------------------------------------
// authFetch — same token source as appService.getAuthHeaders
// ---------------------------------------------------------------------------

export function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}

// ---------------------------------------------------------------------------
// SDK surface (mirrors @veltrixsecops/app-sdk hooks/client per the contract)
// ---------------------------------------------------------------------------

export function useAppContext(): AppContextValue {
  const ctx = React.useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppContextProvider')
  }
  return ctx
}

/**
 * The app's brand identity (per the SDK's useAppBranding contract). The host
 * already applies it in the defined slots — the app navbar and the scoped
 * --veltrix-app-primary / --veltrix-app-accent CSS variables — so app pages
 * only need this when they want the values programmatically.
 */
export function useAppBranding(): AppBranding | null {
  return useAppContext().branding ?? null
}

export function usePipelineStatus(appId: string): {
  data: PipelineStatusData | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
} {
  const [data, setData] = React.useState<PipelineStatusData | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<Error | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await authFetch(`/api/pipeline/summary?appId=${encodeURIComponent(appId)}`)
      if (!response.ok) throw new Error('Failed to fetch pipeline status')
      const result = (await response.json()) as PipelineStatusData
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }, [appId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, isLoading, error, refresh }
}

export function getHostRuntime(): VeltrixHostRuntime | null {
  const runtime = (globalThis as Record<string, unknown>)[HOST_RUNTIME_GLOBAL]
  return (runtime as VeltrixHostRuntime) ?? null
}

export function requireHostRuntime(): VeltrixHostRuntime {
  const runtime = getHostRuntime()
  if (!runtime) {
    throw new Error(
      'Veltrix host runtime not found — app client bundles only run inside the ' +
        `Veltrix platform (missing globalThis.${HOST_RUNTIME_GLOBAL})`,
    )
  }
  return runtime
}

// ---------------------------------------------------------------------------
// SDK /client data helpers — the host implementation of the
// `@veltrixsecops/app-sdk/client` surface. App bundles externalize that subpath
// to this runtime (see app-client-bundle.route.ts RUNTIME_SHIM_PROPS → 'sdk'),
// so these MUST mirror the SDK: sdk/src/client/{inventory,access-servers,
// credentials}.ts in the veltrix-apps repo. All authenticate via authFetch.
// ---------------------------------------------------------------------------

/** Build an Error from a non-2xx response, preferring the platform's message. */
async function sdkApiError(res: Response): Promise<Error> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: string; message?: string }
      const message = body?.error ?? body?.message
      if (message) return new Error(message)
    } catch {
      // Body was not JSON — fall through and use the raw text.
    }
    return new Error(text)
  }
  return new Error(`HTTP ${res.status}`)
}

/** Normalize a bare array or a paginated `{ data }` response to a plain array. */
function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: T[] }).data
  }
  return []
}

// --- Tools + Inventory (platform components) ---

async function resolveTool(name: string): Promise<{ id: string; name: string } | null> {
  const res = await authFetch('/api/tools')
  if (!res.ok) throw await sdkApiError(res)
  const tools = asArray<{ id: string; name: string }>(await res.json())
  return tools.find((tool) => tool.name === name) ?? null
}

interface RawComponent {
  id: string
  hostname?: string
  port?: string
  type?: string[]
  domains?: string[]
  ipRanges?: string[]
  tags?: Array<{ id: string; name: string }>
  connectivityProviderId?: string | null
  credentialId?: string | null
}

function toInventoryItem(raw: RawComponent) {
  return {
    id: String(raw.id),
    hostname: raw.hostname ?? '',
    port: raw.port ?? undefined,
    type: Array.isArray(raw.type) ? raw.type : undefined,
    domains: Array.isArray(raw.domains) ? raw.domains : [],
    ipRanges: Array.isArray(raw.ipRanges) ? raw.ipRanges : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => ({ id: String(t.id), name: String(t.name) })) : [],
    connectivityProviderId: raw.connectivityProviderId ?? null,
    credentialId: raw.credentialId ?? null,
  }
}

async function listInventory() {
  const res = await authFetch('/api/components')
  if (!res.ok) throw await sdkApiError(res)
  const data = (await res.json()) as RawComponent[]
  return Array.isArray(data) ? data.map(toInventoryItem) : []
}

async function addInventoryItem(input: unknown) {
  const res = await authFetch('/api/components', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await sdkApiError(res)
  return toInventoryItem((await res.json()) as RawComponent)
}

async function updateInventoryItem(id: string, input: unknown) {
  const res = await authFetch(`/api/components/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await sdkApiError(res)
  return toInventoryItem((await res.json()) as RawComponent)
}

async function removeInventoryItem(id: string): Promise<void> {
  const res = await authFetch(`/api/components/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw await sdkApiError(res)
}

// --- Connectivity providers (ZTNA) — for the Access Server link picker ---

async function listConnectivityProviders() {
  const res = await authFetch('/api/connectivity-providers')
  if (!res.ok) throw await sdkApiError(res)
  const providers = asArray<{ id: string; name?: string; providerType?: string; status?: string }>(await res.json())
  return providers.map((p) => ({
    id: String(p.id),
    name: p.name ?? '',
    providerType: p.providerType ?? undefined,
    status: p.status ?? undefined,
  }))
}

// --- Environments (deployment scopes) — for the Environment picker ---

async function listEnvironments() {
  const res = await authFetch('/api/environments')
  if (!res.ok) throw await sdkApiError(res)
  const rows = asArray<{ id: string; name?: string }>(await res.json())
  return rows.map((e) => ({ id: String(e.id), name: e.name ?? '' }))
}

// --- Credentials (secrets are write-only; list returns redacted summaries) ---

interface RawCredential {
  id: string
  name?: string
  username?: string
  type?: string | null
  endpoint?: string | null
  toolId?: string
  hasPassword?: boolean
  hasApiToken?: boolean
  password?: string | null
  apiToken?: string | null
  tags?: Array<{ id: string; name: string }>
}

function toCredentialSummary(raw: RawCredential) {
  const hasSecret = Boolean(
    raw.hasApiToken ||
      raw.hasPassword ||
      (raw.apiToken && raw.apiToken.length > 0) ||
      (raw.password && raw.password.length > 0),
  )
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    username: raw.username ?? '',
    type: raw.type ?? null,
    endpoint: raw.endpoint ?? null,
    toolId: raw.toolId ?? '',
    hasSecret,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => ({ id: String(t.id), name: String(t.name) })) : [],
  }
}

async function listCredentials(toolId: string) {
  const res = await authFetch(`/api/tools/${encodeURIComponent(toolId)}/credentials`)
  if (!res.ok) throw await sdkApiError(res)
  return asArray<RawCredential>(await res.json()).map(toCredentialSummary)
}

interface CredentialWriteInput {
  name: string
  username: string
  password?: string
  apiToken?: string
  type?: string
  endpoint?: string
  toolId?: string
  tagIds?: string[]
}

async function createCredential(input: CredentialWriteInput): Promise<{ id: string }> {
  const res = await authFetch('/api/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      username: input.username,
      password: input.password ?? '',
      apiToken: input.apiToken,
      type: input.type,
      endpoint: input.endpoint,
      toolId: input.toolId,
      tagIds: input.tagIds ?? [],
    }),
  })
  if (!res.ok) throw await sdkApiError(res)
  const body = (await res.json()) as { id?: string }
  return { id: String(body.id) }
}

async function updateCredential(
  id: string,
  input: Partial<CredentialWriteInput>,
): Promise<{ id: string }> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.username !== undefined) body.username = input.username
  if (input.password !== undefined) body.password = input.password
  if (input.apiToken !== undefined) body.apiToken = input.apiToken
  if (input.type !== undefined) body.type = input.type
  if (input.endpoint !== undefined) body.endpoint = input.endpoint
  if (input.tagIds !== undefined) body.tagIds = input.tagIds
  const res = await authFetch(`/api/credentials/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await sdkApiError(res)
  const result = (await res.json().catch(() => ({}))) as { id?: string }
  return { id: result.id ? String(result.id) : id }
}

async function removeCredential(id: string): Promise<void> {
  const res = await authFetch(`/api/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw await sdkApiError(res)
}

/**
 * Test a Connection's endpoint + credential. Runs the owning app's connectivity
 * test handler on the server (secret never returned). A failed test resolves
 * with `{ ok: false, message }` rather than throwing.
 */
async function testConnection(
  appId: string,
  credentialId: string,
): Promise<{ ok: boolean; message: string; details?: string[]; latencyMs?: number }> {
  const res = await authFetch(
    `/api/apps/${encodeURIComponent(appId)}/connections/${encodeURIComponent(credentialId)}/test`,
    { method: 'POST' },
  )
  if (!res.ok) {
    const err = await sdkApiError(res)
    return { ok: false, message: err.message }
  }
  return res.json()
}

/**
 * Run an app operation (a one-off action like restart/export, not a config
 * deploy). Mirrors the SDK client `runOperation`. A failed operation resolves
 * with `{ ok: false, message }` rather than throwing.
 */
async function runOperation(
  appId: string,
  operationId: string,
  opts: { credentialId?: string; params?: Record<string, unknown> } = {},
): Promise<{ ok: boolean; message: string; details?: string[]; data?: Record<string, unknown> }> {
  const res = await authFetch(
    `/api/apps/${encodeURIComponent(appId)}/operations/${encodeURIComponent(operationId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId: opts.credentialId, params: opts.params ?? {} }),
    },
  )
  if (!res.ok) {
    const err = await sdkApiError(res)
    return { ok: false, message: err.message }
  }
  return res.json()
}

const sdk: Record<string, unknown> = {
  AppContext,
  useAppContext,
  useAppBranding,
  usePipelineStatus,
  authFetch,
  getHostRuntime,
  requireHostRuntime,
  HOST_RUNTIME_GLOBAL,
  // Inventory (platform components)
  resolveTool,
  listInventory,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
  // ZTNA connectivity providers (Access Server link picker)
  listConnectivityProviders,
  // Environments (deployment scopes) for the Environment picker
  listEnvironments,
  // Credentials (write-only secrets; list is redacted)
  listCredentials,
  createCredential,
  updateCredential,
  removeCredential,
  testConnection,
  runOperation,
}

// The @veltrixsecops/app-sdk/ui surface — see the interface docs on
// VeltrixHostRuntime.ui above. Keep this list in sync with sdk/src/ui/index.ts
// in the veltrix-apps repo. Includes the component primitives plus the two
// context hooks (useToast, useConfirmDialog) whose host-mounted providers
// AppShell wraps around every app subtree.
const ui: Record<string, unknown> = {
  Button,
  Input,
  Textarea,
  Checkbox,
  Select,
  MultiSelect,
  SearchBox,
  Pagination,
  FilterBar,
  SortSelect,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Badge,
  Tooltip,
  EmptyState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  DataTable,
  StatsCard,
  FormDialog,
  Modal,
  Alert,
  FormField,
  Tabs,
  Spinner,
  useToast,
  useConfirmDialog,
}

// ---------------------------------------------------------------------------
// Permissions (Wave C4) — the plain-callable bridge to the C1 store.
// `VeltrixHostRuntime.permissions` is platform-scoped by default (no appId
// default); `AppContextValue.permissions` (built per-page in
// AppPageHost.tsx) defaults `opts.appId` to the app's own id instead.
// ---------------------------------------------------------------------------

const platformPermissions: AppPermissionsApi = {
  has: (resource, action, opts) => usePermissionStore.getState().hasPermission(resource, action, opts),
  list: () => usePermissionStore.getState().list(),
}

/**
 * Build the permissions API for one app's `AppContextValue`: `has()` without
 * an explicit `opts.appId` checks the app's OWN resources by default (apps
 * check their own declared resources unless told otherwise).
 */
export function createAppScopedPermissionsApi(appId: string): AppPermissionsApi {
  return {
    has: (resource, action, opts) =>
      usePermissionStore.getState().hasPermission(resource, action, {
        appId: opts && 'appId' in opts ? opts.appId : appId,
      }),
    list: () => usePermissionStore.getState().list(),
  }
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export function installHostRuntime(): VeltrixHostRuntime {
  const runtime: VeltrixHostRuntime = {
    react: React,
    reactDom: ReactDOM,
    reactDomClient: ReactDOMClient,
    jsxRuntime,
    AppContext,
    authFetch,
    sdk,
    ui,
    permissions: platformPermissions,
  }
  ;(globalThis as Record<string, unknown>)[HOST_RUNTIME_GLOBAL] = runtime
  return runtime
}

// Installed at import time so the global exists before ANY app bundle loads.
installHostRuntime()

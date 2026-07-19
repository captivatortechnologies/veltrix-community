import { API_URL } from '@/config'
import type { AppListItem, AppDetail, AppPageDeclaration } from '../../../shared/types/app'

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

const getAuthHeadersNoContentType = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || `Request failed: ${response.status}`)
  }
  return response.json()
}

/**
 * Brand identity slots for an enabled app, as prepared by the server
 * (colors are pre-validated hex; logo URLs exist only when the manifest
 * declares a logo whose file exists in the app package).
 */
export interface EnabledAppBranding {
  primaryColor?: string
  accentColor?: string
  logoUrl?: string
  logoDarkUrl?: string
}

export interface EnabledApp {
  appId: string
  name: string
  version: string
  icon?: string
  category: string
  /** App homepage/repository URL, used for the navbar "Source" link. */
  homepage?: string
  pages: AppPageDeclaration[]
  configurationTypes: Array<{ id: string; name: string }>
  /** Omitted by the server when the app declares no usable branding. */
  branding?: EnabledAppBranding
  /**
   * Navigation layout for the app shell: `'tabs'` (default horizontal top nav)
   * or `'sidebar'` (embedded left rail, for apps with many configuration types).
   * The server always sends a normalized value; treated as `'tabs'` when absent.
   */
  navLayout?: 'tabs' | 'sidebar'
}

export interface MarketplaceEntry {
  appId: string
  name: string
  version: string
  vendor: string
  description: string
  category: string
  icon?: string
  /** Brand logo (https:// or data: URL) rendered on the marketplace card. */
  logo?: string
  /** Optional dark-background logo variant. */
  logoDark?: string
  license?: string
  homepage?: string
  available: boolean
  tags?: string[]
  downloadUrl?: string
}

export interface AppSettingValue {
  key: string
  type: string
  label: string
  description?: string
  required: boolean
  options?: unknown
  default?: string
  value: unknown
}

export interface UploadResult {
  message: string
  appId: string
  name: string
  version: string
}

/**
 * Per-tenant version status for an app (GET /api/apps/:appId/version).
 * `installedVersion` is null when the app is registered but not installed for
 * this tenant. `releaseNotes` is markdown describing `latestVersion`.
 */
export interface AppVersionInfo {
  appId: string
  installedVersion: string | null
  latestVersion: string
  upgradeAvailable: boolean
  releaseNotes?: string
  releasedAt?: string
}

/** Result of POST /api/apps/:appId/upgrade. */
export interface UpgradeResult {
  upgraded: boolean
  appId: string
  fromVersion: string
  toVersion: string
  message?: string
}

export const appService = {
  listApps: async (): Promise<AppListItem[]> => {
    const res = await fetch(`${API_URL}/apps`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  getEnabledApps: async (): Promise<EnabledApp[]> => {
    const res = await fetch(`${API_URL}/apps/enabled`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  getAppDetail: async (appId: string): Promise<AppDetail> => {
    const res = await fetch(`${API_URL}/apps/${appId}`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  enableApp: async (appId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/apps/${appId}/enable`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    await handleResponse(res)
  },

  disableApp: async (appId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/apps/${appId}/disable`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    await handleResponse(res)
  },

  installApp: async (appId: string): Promise<{ message: string; appId: string }> => {
    const res = await fetch(`${API_URL}/apps/${appId}/install`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    return handleResponse(res)
  },

  uninstallApp: async (appId: string): Promise<void> => {
    // No request body — must NOT send Content-Type: application/json, or Fastify's
    // JSON body parser rejects it with FST_ERR_CTP_EMPTY_JSON_BODY (400).
    const res = await fetch(`${API_URL}/apps/${appId}`, {
      method: 'DELETE',
      headers: getAuthHeadersNoContentType(),
    })
    await handleResponse(res)
  },

  uploadApp: async (file: File): Promise<UploadResult> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_URL}/apps/upload`, {
      method: 'POST',
      headers: getAuthHeadersNoContentType(),
      body: formData,
    })
    return handleResponse(res)
  },

  installFromUrl: async (url: string): Promise<UploadResult> => {
    const res = await fetch(`${API_URL}/apps/install-from-url`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ url }),
    })
    return handleResponse(res)
  },

  getMarketplace: async (search?: string, category?: string): Promise<MarketplaceEntry[]> => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (category) params.set('category', category)
    const qs = params.toString()
    const res = await fetch(`${API_URL}/apps/marketplace${qs ? `?${qs}` : ''}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  getAppVersion: async (appId: string): Promise<AppVersionInfo> => {
    const res = await fetch(`${API_URL}/apps/${appId}/version`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  upgradeApp: async (appId: string): Promise<UpgradeResult> => {
    const res = await fetch(`${API_URL}/apps/${appId}/upgrade`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    return handleResponse(res)
  },

  getAppSettings: async (appId: string): Promise<{ appId: string; settings: AppSettingValue[] }> => {
    const res = await fetch(`${API_URL}/apps/${appId}/settings`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  updateAppSettings: async (appId: string, settings: Record<string, unknown>): Promise<void> => {
    const res = await fetch(`${API_URL}/apps/${appId}/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ settings }),
    })
    await handleResponse(res)
  },
}

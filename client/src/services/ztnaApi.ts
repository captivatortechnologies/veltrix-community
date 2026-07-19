import { API_URL } from '@/config'

// ---------------------------------------------------------------------------
// ZTNA (Tailscale-based tenant BYO connectivity) API client
//
// Mirrors the server ztna.types.ts shapes. (Upstream also had a
// platform-operator surface here — cross-tenant device listing plus ACL
// policy view/sync — that lived only in the excluded hosted-commercial
// platform-admin portal and has been dropped from the Community Edition.)
// ---------------------------------------------------------------------------

export interface ZtnaStatus {
  configured: boolean
  reachable?: boolean
  tailnet?: string
  apiUrl?: string
  mgmtTag?: string
  deviceCount?: number
  enrolledCustomerCount?: number
  message?: string
}

export interface ZtnaDevice {
  id: string
  name: string
  hostname: string
  addresses: string[]
  os?: string
  clientVersion?: string
  lastSeen?: string
  online: boolean
  tags: string[]
  customerId: string | null
  customerName: string | null
  customerTag: string | null
  updateAvailable?: boolean
}

export interface ZtnaEnrollment {
  id: string
  customerId: string
  customerName: string | null
  tag: string
  label: string | null
  status: string
  tailscaleKeyId: string | null
  expiresAt: string | null
  createdAt: string
}

export interface ZtnaEnrollResult {
  enrollmentId: string
  customerId: string
  tag: string
  /** Single-use auth key — shown ONCE, never retrievable again. */
  authKey: string
  expiresAt: string | null
  installCommands: string
}

// ---------------------------------------------------------------------------
// Helpers (identical convention to cloudAccountApi)
// ---------------------------------------------------------------------------

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

const getAuthHeadersNoBody = (): Record<string, string> => {
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

// ---------------------------------------------------------------------------
// Shared read/lifecycle calls
// ---------------------------------------------------------------------------

interface ZtnaCommonApi {
  status: () => Promise<ZtnaStatus>
  listDevices: () => Promise<ZtnaDevice[]>
  listEnrollments: () => Promise<ZtnaEnrollment[]>
  revokeEnrollment: (id: string) => Promise<{ message: string }>
  deleteDevice: (id: string) => Promise<{ message: string }>
}

function createCommonApi(basePath: string): ZtnaCommonApi {
  return {
    status: () =>
      fetch(`${API_URL}${basePath}/status`, { headers: getAuthHeaders() }).then(handleResponse<ZtnaStatus>),
    listDevices: () =>
      fetch(`${API_URL}${basePath}/devices`, { headers: getAuthHeaders() }).then(handleResponse<ZtnaDevice[]>),
    listEnrollments: () =>
      fetch(`${API_URL}${basePath}/enrollments`, { headers: getAuthHeaders() }).then(
        handleResponse<ZtnaEnrollment[]>
      ),
    revokeEnrollment: (id: string) =>
      fetch(`${API_URL}${basePath}/enrollments/${id}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      }).then(handleResponse<{ message: string }>),
    deleteDevice: (id: string) =>
      fetch(`${API_URL}${basePath}/devices/${id}`, {
        method: 'DELETE',
        headers: getAuthHeadersNoBody(),
      }).then(handleResponse<{ message: string }>),
  }
}

// ---------------------------------------------------------------------------
// Tenant surface (/api/ztna) — self-service for the caller's own tenant
// ---------------------------------------------------------------------------

export const tenantZtnaApi = {
  ...createCommonApi('/ztna'),
  enroll: (label?: string): Promise<ZtnaEnrollResult> =>
    fetch(`${API_URL}/ztna/enroll`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ label }),
    }).then(handleResponse<ZtnaEnrollResult>),
}

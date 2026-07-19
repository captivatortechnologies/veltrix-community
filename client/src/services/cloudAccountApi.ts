import { API_URL } from '@/config'

// ---------------------------------------------------------------------------
// Types (mirrors server schema — CloudAccountConnectionType)
// ---------------------------------------------------------------------------

export const CLOUD_PROVIDER_TYPES = ['aws', 'azure', 'gcp', 'hetzner'] as const

export type CloudProviderType = (typeof CLOUD_PROVIDER_TYPES)[number]

export type CloudAccountScope = 'platform' | 'customer'

export type CloudAccountStatus = 'UNVERIFIED' | 'VERIFIED' | 'ERROR'

export interface CloudAccountConnection {
  id: string
  customerId: string
  scope: CloudAccountScope
  provider: CloudProviderType
  name: string
  authMethod: string
  /** Secret values are masked by the server as `••••••xxxx`. */
  config: Record<string, unknown>
  status: CloudAccountStatus
  statusMessage: string | null
  isDefault: boolean
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCloudAccountRequest {
  provider: CloudProviderType
  name: string
  authMethod: string
  config: Record<string, unknown>
  isDefault?: boolean
}

export interface UpdateCloudAccountRequest {
  name?: string
  config?: Record<string, unknown>
  isDefault?: boolean
}

export interface TestCloudAccountResponse {
  success: boolean
  message: string
  latencyMs?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/**
 * Headers for requests that carry NO body. Sending Content-Type: application/json
 * with an empty body makes Fastify's JSON parser reject it (400
 * FST_ERR_CTP_EMPTY_JSON_BODY), so the header must be omitted.
 */
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

// ---------------------------------------------------------------------------
// API client factory — parameterized by base path. (Upstream also backs a
// platform-operator "Veltrix-managed cloud accounts" surface with this same
// factory; that surface lived only in the excluded hosted-commercial
// platform-admin portal and has been dropped from the Community Edition.)
// ---------------------------------------------------------------------------

export interface CloudAccountApiClient {
  list: () => Promise<CloudAccountConnection[]>
  create: (data: CreateCloudAccountRequest) => Promise<CloudAccountConnection>
  update: (id: string, data: UpdateCloudAccountRequest) => Promise<CloudAccountConnection>
  remove: (id: string) => Promise<void>
  test: (id: string) => Promise<TestCloudAccountResponse>
}

function createCloudAccountApi(basePath: string): CloudAccountApiClient {
  return {
    list: async (): Promise<CloudAccountConnection[]> => {
      const res = await fetch(`${API_URL}${basePath}`, {
        headers: getAuthHeaders(),
      })
      return handleResponse<CloudAccountConnection[]>(res)
    },

    create: async (data: CreateCloudAccountRequest): Promise<CloudAccountConnection> => {
      const res = await fetch(`${API_URL}${basePath}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      })
      return handleResponse<CloudAccountConnection>(res)
    },

    update: async (id: string, data: UpdateCloudAccountRequest): Promise<CloudAccountConnection> => {
      const res = await fetch(`${API_URL}${basePath}/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      })
      return handleResponse<CloudAccountConnection>(res)
    },

    remove: async (id: string): Promise<void> => {
      const res = await fetch(`${API_URL}${basePath}/${id}`, {
        method: 'DELETE',
        headers: getAuthHeadersNoContentType(),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error || `Request failed: ${res.status}`)
      }
    },

    test: async (id: string): Promise<TestCloudAccountResponse> => {
      const res = await fetch(`${API_URL}${basePath}/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      })
      return handleResponse<TestCloudAccountResponse>(res)
    },
  }
}

/** Tenant (BYOC) surface — customer-scoped cloud accounts. */
export const tenantCloudAccountApi = createCloudAccountApi('/cloud-accounts')

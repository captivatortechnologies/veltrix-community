import { API_URL } from '@/config'

// ---------------------------------------------------------------------------
// Types (mirrors server schema)
// ---------------------------------------------------------------------------

export const PROVIDER_TYPES = [
  'tailscale',
  'ssh',
  'wireguard',
  'cloudflare_tunnel',
  'zerotier',
  'nebula',
  'openvpn',
  'aws_ssm',
  'hashicorp_boundary',
] as const

export type ProviderType = (typeof PROVIDER_TYPES)[number]

export type ProviderStatus = 'UNCONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR'

export interface ConnectivityProvider {
  id: string
  customerId: string
  providerType: ProviderType
  name: string
  isDefault: boolean
  isEnabled: boolean
  config: Record<string, unknown>
  status: ProviderStatus
  statusMessage: string | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProviderRequest {
  providerType: ProviderType
  name: string
  config: Record<string, unknown>
  isDefault?: boolean
}

export interface UpdateProviderRequest {
  name?: string
  config?: Record<string, unknown>
  isEnabled?: boolean
}

export interface TestConnectionResponse {
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
// API
// ---------------------------------------------------------------------------

export const connectivityProviderApi = {
  list: async (): Promise<ConnectivityProvider[]> => {
    const res = await fetch(`${API_URL}/connectivity-providers`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<ConnectivityProvider[]>(res)
  },

  get: async (id: string): Promise<ConnectivityProvider> => {
    const res = await fetch(`${API_URL}/connectivity-providers/${id}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<ConnectivityProvider>(res)
  },

  create: async (data: CreateProviderRequest): Promise<ConnectivityProvider> => {
    const res = await fetch(`${API_URL}/connectivity-providers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse<ConnectivityProvider>(res)
  },

  update: async (id: string, data: UpdateProviderRequest): Promise<ConnectivityProvider> => {
    const res = await fetch(`${API_URL}/connectivity-providers/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse<ConnectivityProvider>(res)
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/connectivity-providers/${id}`, {
      method: 'DELETE',
      headers: getAuthHeadersNoContentType(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error || `Request failed: ${res.status}`)
    }
  },

  testConnection: async (id: string): Promise<TestConnectionResponse> => {
    const res = await fetch(`${API_URL}/connectivity-providers/${id}/test`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    return handleResponse<TestConnectionResponse>(res)
  },

  setDefault: async (id: string): Promise<ConnectivityProvider> => {
    const res = await fetch(`${API_URL}/connectivity-providers/${id}/set-default`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    return handleResponse<ConnectivityProvider>(res)
  },
}

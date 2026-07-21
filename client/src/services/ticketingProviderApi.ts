import { API_URL } from '@/config'
import type {
  TicketingProviderId,
  TicketingConnectionDTO,
  TicketingConnectionStatus,
  CreateTicketingConnectionRequest,
  UpdateTicketingConnectionRequest,
  TestTicketingConnectionResponse,
} from '../../../shared/types/ticketing'

// ---------------------------------------------------------------------------
// Types (mirrors server/src/module/ticketing/ticketing.schema.ts + the shared
// DTO contract in shared/types/ticketing.ts). Cloned from
// services/connectivityProviderApi.ts — same fetch/auth-header pattern.
// ---------------------------------------------------------------------------

export const TICKETING_PROVIDERS: TicketingProviderId[] = ['servicenow', 'zendesk']

export type {
  TicketingProviderId,
  TicketingConnectionStatus,
  CreateTicketingConnectionRequest,
  UpdateTicketingConnectionRequest,
  TestTicketingConnectionResponse,
}

/** Local alias matching the `ConnectivityProvider` naming convention used elsewhere. */
export type TicketingConnection = TicketingConnectionDTO

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a cookie value (for the double-submit CSRF token). */
const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

/**
 * Echo the XSRF-TOKEN cookie back in the X-XSRF-TOKEN header the platform's
 * csrfProtection middleware compares on POST/PUT/PATCH/DELETE. (Raw fetch does
 * not do this automatically the way axios does — see lib/apiClient.) Harmless on
 * GET, where CSRF is not checked.
 */
const withCsrf = (headers: Record<string, string>): Record<string, string> => {
  const csrf = getCookie('XSRF-TOKEN')
  if (csrf) headers['X-XSRF-TOKEN'] = csrf
  return headers
}

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return withCsrf(headers)
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
  return withCsrf(headers)
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

export const ticketingProviderApi = {
  list: async (): Promise<TicketingConnection[]> => {
    const res = await fetch(`${API_URL}/ticketing-connections`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<TicketingConnection[]>(res)
  },

  get: async (id: string): Promise<TicketingConnection> => {
    const res = await fetch(`${API_URL}/ticketing-connections/${id}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse<TicketingConnection>(res)
  },

  create: async (data: CreateTicketingConnectionRequest): Promise<TicketingConnection> => {
    const res = await fetch(`${API_URL}/ticketing-connections`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse<TicketingConnection>(res)
  },

  update: async (id: string, data: UpdateTicketingConnectionRequest): Promise<TicketingConnection> => {
    const res = await fetch(`${API_URL}/ticketing-connections/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    })
    return handleResponse<TicketingConnection>(res)
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/ticketing-connections/${id}`, {
      method: 'DELETE',
      headers: getAuthHeadersNoContentType(),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error || `Request failed: ${res.status}`)
    }
  },

  testConnection: async (id: string): Promise<TestTicketingConnectionResponse> => {
    const res = await fetch(`${API_URL}/ticketing-connections/${id}/test`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    })
    return handleResponse<TestTicketingConnectionResponse>(res)
  },

  /**
   * No dedicated set-default endpoint exists server-side for ticketing
   * connections (unlike connectivity providers) — `isDefault` is just another
   * field on `PUT /ticketing-connections/:id` (see ticketing.route.ts).
   */
  setDefault: async (id: string): Promise<TicketingConnection> => {
    return ticketingProviderApi.update(id, { isDefault: true })
  },
}

export default ticketingProviderApi

import { API_URL } from '@/config'

// Auth mirrors client/src/components/shared/Pipeline/api/pipelineApi.ts:
// localStorage/sessionStorage 'token' Bearer + X-XSRF-TOKEN cookie on mutations.

const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift()
    return cookieValue || null
  }
  return null
}

const getAuthHeaders = (includeContentType = true, includeCSRF = false): Record<string, string> => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (includeContentType) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (includeCSRF) {
    const csrfToken = getCookie('XSRF-TOKEN')
    if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken
  }
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || `Request failed: ${response.status}`)
  }
  return response.json()
}

// --- Types (mirror server/src/module/environment/environment.schema.ts) ---

export type DeploymentStrategy = 'DIRECT' | 'CANARY' | 'BLUE_GREEN' | 'ROLLING'

export interface EnvironmentOwner {
  id: string
  name: string | null
  email: string
}

export interface EnvironmentPolicy {
  id: string | null
  tagId: string
  appId: string | null
  requireApproval: boolean
  minApprovers: number
  requiredApproverRoles: string[]
  deploymentStrategy: DeploymentStrategy
  canarySteps: number[]
  healthCheckTimeout: number
  autoRollbackOnError: boolean
  errorRateThreshold: number
  requirePreviousEnv: boolean
  previousEnvTagId: string | null
  isDefault: boolean
}

export interface EnvironmentRecord {
  id: string
  name: string
  ownerId: string | null
  owner: EnvironmentOwner | null
  policy: EnvironmentPolicy | null
  deploymentCount: number
  canvasCount: number
}

export interface OwnerOption {
  id: string
  name: string | null
  email: string
  customerId?: string
}

export interface CreateEnvironmentInput {
  name: string
  ownerId?: string | null
}

export interface UpdateEnvironmentInput {
  name?: string
  ownerId?: string | null
}

export type UpdatePolicyInput = Partial<
  Pick<
    EnvironmentPolicy,
    | 'requireApproval'
    | 'minApprovers'
    | 'requiredApproverRoles'
    | 'deploymentStrategy'
    | 'canarySteps'
    | 'healthCheckTimeout'
    | 'autoRollbackOnError'
    | 'errorRateThreshold'
    | 'requirePreviousEnv'
    | 'previousEnvTagId'
  >
>

// --- API ---

export const environmentsApi = {
  list: async (): Promise<EnvironmentRecord[]> => {
    const res = await fetch(`${API_URL}/environments`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  create: async (input: CreateEnvironmentInput): Promise<EnvironmentRecord> => {
    const res = await fetch(`${API_URL}/environments`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(input),
    })
    return handleResponse(res)
  },

  update: async (id: string, input: UpdateEnvironmentInput): Promise<EnvironmentRecord> => {
    const res = await fetch(`${API_URL}/environments/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(input),
    })
    return handleResponse(res)
  },

  remove: async (id: string): Promise<{ message: string }> => {
    // No request body — omit Content-Type so Fastify doesn't 400 with
    // "Body cannot be empty when content-type is set to 'application/json'".
    const res = await fetch(`${API_URL}/environments/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false, true),
    })
    return handleResponse(res)
  },

  getPolicy: async (id: string): Promise<EnvironmentPolicy> => {
    const res = await fetch(`${API_URL}/environments/${id}/policy`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },

  savePolicy: async (id: string, input: UpdatePolicyInput): Promise<EnvironmentPolicy> => {
    const res = await fetch(`${API_URL}/environments/${id}/policy`, {
      method: 'PUT',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify(input),
    })
    return handleResponse(res)
  },

  // Owner options come from the shared users endpoint.
  listUsers: async (): Promise<OwnerOption[]> => {
    const res = await fetch(`${API_URL}/users`, { headers: getAuthHeaders() })
    return handleResponse(res)
  },
}

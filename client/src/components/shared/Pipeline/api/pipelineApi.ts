import { API_URL } from '@/config'

// Helper function to get cookie value by name
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

// --- Types ---

export type ConfigCanvasStatus =
  | 'DRAFT'
  | 'VALIDATION_PENDING'
  | 'VALIDATION_FAILED'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'DEPLOYMENT_QUEUED'
  | 'DEPLOYING'
  | 'DEPLOYMENT_PAUSED'
  | 'DEPLOYED'
  | 'DEPLOYMENT_FAILED'
  | 'ROLLED_BACK'
  | 'ARCHIVED'

export type DeploymentStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'HEALTH_CHECKING'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'

export type DeploymentStrategy = 'DIRECT' | 'CANARY' | 'BLUE_GREEN' | 'ROLLING'

export type DriftSeverity = 'info' | 'warning' | 'critical'

export interface ValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string; code: string }>
  warnings: Array<{ field: string; message: string; code: string }>
}

export interface Deployment {
  id: string
  canvasId: string
  environmentId: string
  status: DeploymentStatus
  strategy: DeploymentStrategy
  healthScore: number | null
  errorRate: number | null
  canaryPercent: number | null
  createdAt: string
  completedAt: string | null
  environment: { id: string; name: string }
  triggeredBy: { id: string; name: string; email: string }
  logs?: DeploymentLog[]
  canvas?: { name: string; toolType: string; entityType: string }
}

export interface DeploymentLog {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
}

/** Who changed a field + when, best-effort attribution from the platform's audit trail. */
export interface DriftDiffActor {
  id?: string
  name?: string
  email?: string
  at?: string
  eventType?: string
  source?: string
}

export interface DriftDiff {
  field: string
  expected: unknown
  actual: unknown
  severity: DriftSeverity
  actor?: DriftDiffActor
}

export interface DriftRecord {
  id: string
  appId: string
  configTypeId: string
  environmentId: string
  componentId: string | null
  severity: DriftSeverity
  diffs: DriftDiff[]
  isResolved: boolean
  detectedAt: string
  resolvedAt: string | null
  resolvedAction: string | null
  environment: { id: string; name: string } | null
  component: { id: string; hostname: string } | null
}

/** Response of a canvas-scoped drift check/list — the records for ONE configuration. */
export interface CanvasDriftResponse {
  data: DriftRecord[]
}

/** Response of an on-demand, cross-config drift detection sweep. */
export interface DriftDetectResponse {
  checked: true
  unresolved: number
  data: DriftRecord[]
}

export interface EnvironmentMatrixEntry {
  canvas: {
    id: string
    name: string
    toolType: string
    entityType: string
    status: ConfigCanvasStatus
    version: number
  }
  environments: Array<{
    environmentId: string
    environmentName: string
    deployment: {
      id: string
      status: DeploymentStatus
      strategy: DeploymentStrategy
      healthScore: number | null
      startedAt: string
      completedAt: string | null
    } | null
  }>
}

export interface EnvironmentMatrixResponse {
  environments: Array<{ id: string; name: string }>
  matrix: EnvironmentMatrixEntry[]
}

export interface PipelineSummary {
  pendingValidations: number
  pendingApprovals: number
  activeDeployments: number
  failedDeployments: number
  unresolvedDrifts: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// --- API Functions ---

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || `Request failed: ${response.status}`)
  }
  return response.json()
}

export const pipelineApi = {
  // Canvas pipeline actions
  validate: async (canvasId: string): Promise<ValidationResult> => {
    const res = await fetch(`${API_URL}/pipeline/canvas/${canvasId}/validate`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
    })
    return handleResponse(res)
  },

  deploy: async (
    canvasId: string,
    environmentId: string,
    strategy?: DeploymentStrategy,
  ): Promise<{ deploymentId: string }> => {
    const res = await fetch(`${API_URL}/pipeline/canvas/${canvasId}/deploy`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ environmentId, strategy }),
    })
    return handleResponse(res)
  },

  getDeployments: async (canvasId: string, limit = 20): Promise<Deployment[]> => {
    const res = await fetch(
      `${API_URL}/pipeline/canvas/${canvasId}/deployments?limit=${limit}`,
      { headers: getAuthHeaders() },
    )
    return handleResponse(res)
  },

  // Deployment actions
  getDeploymentStatus: async (deploymentId: string): Promise<Deployment> => {
    const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  rollback: async (deploymentId: string, reason: string): Promise<{ deploymentId: string }> => {
    const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}/rollback`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ reason }),
    })
    return handleResponse(res)
  },

  pauseDeployment: async (deploymentId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
    })
    await handleResponse(res)
  },

  resumeDeployment: async (deploymentId: string): Promise<void> => {
    const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}/resume`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
    })
    await handleResponse(res)
  },

  promote: async (
    deploymentId: string,
    targetEnvironmentId: string,
  ): Promise<{ deploymentId: string }> => {
    const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}/promote`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ targetEnvironmentId }),
    })
    return handleResponse(res)
  },

  // Environment Matrix
  getEnvironmentMatrix: async (): Promise<EnvironmentMatrixResponse> => {
    const res = await fetch(`${API_URL}/pipeline/environment-matrix`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  // Dashboard
  getSummary: async (): Promise<PipelineSummary> => {
    const res = await fetch(`${API_URL}/pipeline/summary`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  // Drift
  getDriftRecords: async (params?: {
    environmentId?: string
    isResolved?: boolean
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<DriftRecord>> => {
    const searchParams = new URLSearchParams()
    if (params?.environmentId) searchParams.set('environmentId', params.environmentId)
    if (params?.isResolved !== undefined) searchParams.set('isResolved', String(params.isResolved))
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.limit) searchParams.set('limit', String(params.limit))

    const res = await fetch(`${API_URL}/pipeline/drift?${searchParams}`, {
      headers: getAuthHeaders(),
    })
    return handleResponse(res)
  },

  resolveDrift: async (driftId: string, action: string): Promise<DriftRecord> => {
    const res = await fetch(`${API_URL}/pipeline/drift/${driftId}/resolve`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ action }),
    })
    return handleResponse(res)
  },

  /** GET /pipeline/configuration-canvas/:canvasId/drift — drift records for ONE configuration. */
  getCanvasDrift: async (canvasId: string): Promise<DriftRecord[]> => {
    const res = await fetch(`${API_URL}/pipeline/configuration-canvas/${canvasId}/drift`, {
      headers: getAuthHeaders(),
    })
    const body = await handleResponse<CanvasDriftResponse>(res)
    return body.data
  },

  /**
   * POST /pipeline/configuration-canvas/:canvasId/drift/check — runs a drift check for ONE
   * config, then returns its records. No request body, so Content-Type is omitted (an empty
   * JSON body would trip Fastify's FST_ERR_CTP_EMPTY_JSON_BODY).
   */
  checkCanvasDrift: async (canvasId: string): Promise<CanvasDriftResponse> => {
    const res = await fetch(`${API_URL}/pipeline/configuration-canvas/${canvasId}/drift/check`, {
      method: 'POST',
      headers: getAuthHeaders(false, true),
    })
    return handleResponse(res)
  },

  /** POST /pipeline/drift/detect — on-demand "check now" across all configs, or one environment. */
  detectDrift: async (environmentId?: string): Promise<DriftDetectResponse> => {
    const res = await fetch(`${API_URL}/pipeline/drift/detect`, {
      method: 'POST',
      headers: getAuthHeaders(true, true),
      body: JSON.stringify({ environmentId }),
    })
    return handleResponse(res)
  },
}

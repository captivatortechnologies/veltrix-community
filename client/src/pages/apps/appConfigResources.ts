// ========================================================================
// appConfigResources — thin, generic clients for the platform resources the
// generic Configuration Canvas page needs beyond CRUD (which lives in
// configurationCanvasApi): pipeline validate/deploy, deployment status,
// registered components (connections), tags (environments), and users
// (approval dialog).
//
// All requests authenticate with the localStorage 'token' Bearer — the SAME
// source configurationCanvasApi/authFetch use, deliberately NOT the
// tools-integration 'authToken'. None of this is app-specific.
// ========================================================================

import { API_URL } from '@/config'

// ---------------------------------------------------------------------------
// Auth headers (mirrors configurationCanvasApi: 'token' Bearer + XSRF cookie
// echoed back on state-changing requests).
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

function authHeaders(includeContentType = false, includeCsrf = false): Record<string, string> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (includeContentType) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (includeCsrf) {
    const csrf = getCookie('XSRF-TOKEN')
    if (csrf) headers['X-XSRF-TOKEN'] = csrf
  }
  return headers
}

async function asJson<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized: Please log in again.')
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error || `Failed to ${action}: ${res.statusText}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Live field options — powers `remote-multiselect` fields. Generic: the app's
// options provider decides what `source` means; this just relays it.
// ---------------------------------------------------------------------------

export interface ConfigOptionItem {
  value: string
  label: string
  description?: string
}

/**
 * Fetch live options for a `remote-multiselect` field. The platform resolves the
 * connection and runs the app's options provider server-side, so nothing
 * app-specific lives here. GET /apps/:appId/config-options.
 */
export async function fetchConfigOptions(params: {
  appId: string
  configTypeId: string
  source: string
  environmentId?: string
  query?: string
}): Promise<ConfigOptionItem[]> {
  const qs = new URLSearchParams({ configTypeId: params.configTypeId, source: params.source })
  if (params.environmentId) qs.set('environmentId', params.environmentId)
  if (params.query) qs.set('q', params.query)
  const res = await fetch(
    `${API_URL}/apps/${encodeURIComponent(params.appId)}/config-options?${qs.toString()}`,
    { method: 'GET', headers: authHeaders(), credentials: 'include' },
  )
  const body = await asJson<{ options?: ConfigOptionItem[] }>(res, 'load options')
  return Array.isArray(body.options) ? body.options : []
}

// ---------------------------------------------------------------------------
// Pipeline — validate / deploy / deployment status
// ---------------------------------------------------------------------------

export interface CanvasValidationIssue {
  field?: string
  message: string
  code?: string
}

export interface CanvasValidationResult {
  valid: boolean
  errors: CanvasValidationIssue[]
  warnings: CanvasValidationIssue[]
}

export interface CanvasDeployResponse {
  deploymentId: string
}

export interface DeploymentStatus {
  id: string
  status: string
  canvasId?: string
  environmentId?: string
  message?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

/** Statuses at which polling a deployment can stop. */
// Must match the server's DeploymentStatus enum: the SUCCESS terminal is
// SUCCEEDED (NOT "DEPLOYED", which is a canvas status, not a deployment status).
export const TERMINAL_DEPLOYMENT_STATUSES = ['SUCCEEDED', 'FAILED', 'ROLLED_BACK']

/** POST /api/pipeline/canvas/:id/validate — requires the canvas to be persisted. */
export async function validateCanvas(canvasId: string): Promise<CanvasValidationResult> {
  // No request body — must NOT send Content-Type: application/json, or Fastify's
  // JSON body parser rejects it with 400 FST_ERR_CTP_EMPTY_JSON_BODY.
  const res = await fetch(`${API_URL}/pipeline/canvas/${canvasId}/validate`, {
    method: 'POST',
    headers: authHeaders(false, true),
    credentials: 'include',
  })
  const result = await asJson<Partial<CanvasValidationResult>>(res, 'validate configuration')
  return {
    valid: result.valid ?? false,
    errors: result.errors ?? [],
    warnings: result.warnings ?? [],
  }
}

/** POST /api/pipeline/canvas/:id/deploy — requires status APPROVED server-side. */
export async function deployCanvas(
  canvasId: string,
  environmentId: string,
  strategy?: string,
): Promise<CanvasDeployResponse> {
  const res = await fetch(`${API_URL}/pipeline/canvas/${canvasId}/deploy`, {
    method: 'POST',
    headers: authHeaders(true, true),
    credentials: 'include',
    body: JSON.stringify({ environmentId, strategy }),
  })
  return asJson<CanvasDeployResponse>(res, 'deploy configuration')
}

/** GET /api/pipeline/deployments/:deploymentId */
export async function getDeployment(deploymentId: string): Promise<DeploymentStatus> {
  const res = await fetch(`${API_URL}/pipeline/deployments/${deploymentId}`, {
    method: 'GET',
    headers: authHeaders(),
    credentials: 'include',
  })
  return asJson<DeploymentStatus>(res, 'fetch deployment status')
}

/**
 * Poll a deployment until it reaches a terminal status or the attempt budget is
 * exhausted. Best-effort: transient fetch errors are swallowed between polls.
 */
export async function pollDeployment(
  deploymentId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<DeploymentStatus | null> {
  const intervalMs = opts.intervalMs ?? 2000
  const maxAttempts = opts.maxAttempts ?? 30
  let last: DeploymentStatus | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      last = await getDeployment(deploymentId)
      if (TERMINAL_DEPLOYMENT_STATUSES.includes(last.status)) return last
    } catch {
      // transient — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return last
}

// ---------------------------------------------------------------------------
// Connections — registered components
// ---------------------------------------------------------------------------

export interface PlatformComponent {
  id: string
  name?: string
  type?: string
  status?: string
}

/** GET /api/components — all components for the tenant; callers filter by type. */
export async function fetchComponents(): Promise<PlatformComponent[]> {
  try {
    const res = await fetch(`${API_URL}/components`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data?.data ?? [])
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Tags (environments) and users — for tag selection + the approval dialog.
// ---------------------------------------------------------------------------

export interface PlatformTag {
  id: string
  name: string
  color?: string
}

/** GET /api/tags — token-Bearer (NOT tagApi, which reads the wrong 'authToken'). */
export async function fetchTags(): Promise<PlatformTag[]> {
  try {
    const res = await fetch(`${API_URL}/tags`, {
      method: 'GET',
      headers: authHeaders(),
      credentials: 'include',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data?.data ?? [])
  } catch {
    return []
  }
}

export interface PlatformUser {
  id: string
  name: string
  email: string
  role?: string
}

/** GET /api/users — token-Bearer; used by the approval submission dialog. */
export async function fetchUsers(): Promise<PlatformUser[]> {
  const res = await fetch(`${API_URL}/users`, {
    method: 'GET',
    headers: authHeaders(),
    credentials: 'include',
  })
  const data = await asJson<PlatformUser[] | { data: PlatformUser[] }>(res, 'fetch users')
  return Array.isArray(data) ? data : (data?.data ?? [])
}

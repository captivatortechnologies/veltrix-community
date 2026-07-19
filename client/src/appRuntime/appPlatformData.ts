// ========================================================================
// App platform data accessors — the AppContext data-fetching functions
// handed to app client pages (installed AND sandbox-preview alike), backed
// by real platform APIs. Extracted from AppPageHost so the sandbox
// Preview surface (S6.5) can build an identical AppContextValue without
// duplicating this fetch/normalize logic — both hosts must expose the same
// contract, since app code cannot tell the difference at runtime.
// ========================================================================

import { authFetch } from './installHostRuntime'

export async function fetchJsonArray(url: string): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await authFetch(url)
    if (!res.ok) return []
    const json: unknown = await res.json()
    return Array.isArray(json) ? (json as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

/**
 * The platform has no customer-wide credential listing endpoint — credentials
 * are scoped per tool (GET /api/tools/:toolId/credentials). Fan out across
 * the customer's configured tools and flatten; any failure resolves [].
 */
export async function fetchAllCredentials(customerId: string): Promise<Array<Record<string, unknown>>> {
  if (!customerId) return []
  try {
    const tools = await fetchJsonArray(`/api/customers/${encodeURIComponent(customerId)}/tools`)
    if (tools.length === 0) return []
    const perTool = await Promise.all(
      tools.map((tool) =>
        typeof tool.id === 'string'
          ? fetchJsonArray(`/api/tools/${encodeURIComponent(tool.id)}/credentials`)
          : Promise.resolve<Array<Record<string, unknown>>>([]),
      ),
    )
    return perTool.flat()
  } catch {
    return []
  }
}

/**
 * GET /api/apps/:appId/settings returns { settings: [{ key, value, ... }] }.
 * App pages consume settings as a key -> value record per the SDK contract.
 */
export function normalizeSettings(raw: unknown): Record<string, unknown> {
  if (Array.isArray(raw)) {
    const result: Record<string, unknown> = {}
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && typeof (entry as { key?: unknown }).key === 'string') {
        result[(entry as { key: string }).key] = (entry as { value?: unknown }).value
      }
    }
    return result
  }
  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>
  }
  return {}
}

// ServiceNow adapter — implements TicketProvider against the ServiceNow
// Table API (https://<instance>.service-now.com/api/now/table/<table>).
//
// Change & issue management maps onto standard tables:
//   change  -> change_request     incident -> incident
//   problem -> problem            task     -> task
//
// Auth: HTTP Basic (service account user/password) or an OAuth2 bearer token.
// The Table API returns a `{ result: … }` envelope. `sys_id` is the stable
// externalId; the human `number` (CHG0030001) is the externalKey.
//
// NOTE: the request/response *shapes* and endpoint URLs below are real. Bodies
// that map platform fields onto instance-specific fields (priority, category,
// assignment_group, cmdb ci …) are marked TODO — those depend on the tenant's
// ServiceNow configuration and belong in the connection `config` field map.

import {
  TicketProvider,
  TicketProviderContext,
  CreateTicketInput,
  TicketRef,
  TicketSearchQuery,
  TicketProviderTestResult,
  TicketStatusTransition,
  authorizationHeader,
  normalizeInstanceUrl,
  DEFAULT_TIMEOUT_MS,
} from './types'
import type { TicketType } from '../ticketing.schema'

const TABLE_BY_TYPE: Record<TicketType, string> = {
  change: 'change_request',
  incident: 'incident',
  problem: 'problem',
  task: 'task',
}

// A ServiceNow record `number` carries a table-specific prefix (INC0010001 is an
// incident, CHG… a change, PRB… a problem, TASK… a task). Used to look in the
// right table first when the caller only gives us the human number, not a sys_id.
const TABLE_BY_NUMBER_PREFIX: Record<string, string> = {
  INC: 'incident',
  CHG: 'change_request',
  PRB: 'problem',
  TASK: 'task',
}

// A sys_id is a 32-char hex GUID; anything else the user pastes (INC0010001) is a
// human `number` that the Table API's `/{table}/{id}` GET does NOT accept.
const SYS_ID_RE = /^[0-9a-f]{32}$/i

interface ServiceNowRecord {
  sys_id?: string
  number?: string
  short_description?: string
  state?: string
  [key: string]: unknown
}

export class ServiceNowAdapter implements TicketProvider {
  readonly provider = 'servicenow' as const

  supportedTicketTypes(): TicketType[] {
    return ['change', 'incident', 'problem', 'task']
  }

  getSensitiveFields(): string[] {
    // When secrets are stored inline in config (not via a Credential row).
    return ['password', 'accessToken', 'refreshToken', 'clientSecret']
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const defaultTable = config.defaultTable
    if (defaultTable !== undefined && typeof defaultTable === 'string') {
      const known = Object.values(TABLE_BY_TYPE)
      if (!known.includes(defaultTable)) {
        errors.push(`defaultTable "${defaultTable}" is not a known table (${known.join(', ')}).`)
      }
    }
    return { valid: errors.length === 0, errors }
  }

  async testConnection(ctx: TicketProviderContext): Promise<TicketProviderTestResult> {
    const start = Date.now()
    try {
      // Cheap authenticated probe: one row from the default table.
      const table = this.resolveTable(ctx)
      const res = await this.request(ctx, 'GET', `/api/now/table/${table}?sysparm_limit=1`)
      const latencyMs = Date.now() - start
      if (res.ok) {
        return { success: true, message: `Connected to ServiceNow (${table}).`, latencyMs }
      }
      if (res.status === 401) {
        return { success: false, message: 'ServiceNow rejected the credentials (401).', latencyMs }
      }
      return { success: false, message: `ServiceNow returned ${res.status}.`, latencyMs }
    } catch (err) {
      return { success: false, message: describeError(err), latencyMs: Date.now() - start }
    }
  }

  async createTicket(ctx: TicketProviderContext, input: CreateTicketInput): Promise<TicketRef> {
    const table = this.resolveTable(ctx, input.ticketType)

    // TODO(ticketing): map input.fields onto instance-specific columns using the
    // connection `config.fieldMap` (priority, category, assignment_group, cmdb_ci).
    const body: Record<string, unknown> = {
      short_description: input.summary,
      description: this.composeDescription(input),
      ...(input.fields ?? {}),
    }

    const res = await this.request(ctx, 'POST', `/api/now/table/${table}`, body)
    if (!res.ok) {
      throw new Error(`ServiceNow create failed (${res.status}): ${await safeText(res)}`)
    }
    const record = ((await res.json()) as { result?: ServiceNowRecord }).result ?? {}
    return this.toTicketRef(ctx, table, record)
  }

  async getTicket(ctx: TicketProviderContext, externalRef: string): Promise<TicketRef | null> {
    // externalRef is EITHER a sys_id (32-char hex GUID) or a human number like
    // INC0010001. The Table API's `/{table}/{id}` GET only accepts a sys_id, so a
    // number must be looked up with `?sysparm_query=number=…`. We also don't know
    // the table up front — infer it from the number prefix, then fall back to the
    // other supported tables so a link never fails just because it's an incident
    // rather than the configured default (change_request).
    const ref = externalRef.trim()
    if (!ref) return null

    const bySysId = SYS_ID_RE.test(ref)
    for (const table of this.candidateTables(ctx, ref, bySysId)) {
      const record = bySysId
        ? await this.fetchBySysId(ctx, table, ref)
        : await this.fetchByNumber(ctx, table, ref)
      if (record) return this.toTicketRef(ctx, table, record)
    }
    return null
  }

  async searchTickets(ctx: TicketProviderContext, query: TicketSearchQuery): Promise<TicketRef[]> {
    const table = this.resolveTable(ctx, query.ticketType)
    const limit = Math.min(query.limit ?? 25, 100)
    // sysparm_query encodes a filter; here a keyword LIKE on short_description.
    const params = new URLSearchParams({ sysparm_limit: String(limit) })
    if (query.text) params.set('sysparm_query', `short_descriptionLIKE${query.text}`)
    // TODO(ticketing): also filter by state when query.status is provided,
    // mapping the platform status onto the instance's numeric state values.
    const res = await this.request(ctx, 'GET', `/api/now/table/${table}?${params.toString()}`)
    if (!res.ok) throw new Error(`ServiceNow search failed (${res.status}).`)
    const records = ((await res.json()) as { result?: ServiceNowRecord[] }).result ?? []
    return records.map((r) => this.toTicketRef(ctx, table, r))
  }

  async addComment(ctx: TicketProviderContext, externalId: string, body: string): Promise<void> {
    const table = this.resolveTable(ctx)
    // `comments` = customer-visible; `work_notes` = internal. Platform events go
    // to work_notes so they don't spam the requester.
    const res = await this.request(ctx, 'PATCH', `/api/now/table/${table}/${encodeURIComponent(externalId)}`, {
      work_notes: body,
    })
    if (!res.ok) throw new Error(`ServiceNow comment failed (${res.status}).`)
  }

  async updateStatus(
    ctx: TicketProviderContext,
    externalId: string,
    transition: TicketStatusTransition,
  ): Promise<void> {
    // A safe, config-agnostic default: record the outcome as a work note.
    // TODO(ticketing): optionally advance `state`/`close_code` per config.stateMap
    // (e.g. deploy_succeeded -> Implement/Review) once the tenant's workflow is known.
    await this.addComment(ctx, externalId, formatTransition(transition))
  }

  // --- internals -------------------------------------------------------

  private resolveTable(ctx: TicketProviderContext, ticketType?: TicketType): string {
    if (ticketType) return TABLE_BY_TYPE[ticketType]
    const configured = ctx.config.defaultTable
    if (typeof configured === 'string' && configured) return configured
    return TABLE_BY_TYPE.change
  }

  /**
   * Tables to search for a lookup, best guess first. For a number we lead with the
   * table its prefix implies (INC -> incident); for a sys_id — which is globally
   * unique — we lead with the configured default. Every supported table follows as
   * a fallback, de-duplicated, so a lookup still resolves when the prefix is custom
   * or the record lives outside the default table.
   */
  private candidateTables(ctx: TicketProviderContext, ref: string, bySysId: boolean): string[] {
    const all = Object.values(TABLE_BY_TYPE)
    const lead = bySysId
      ? this.resolveTable(ctx)
      : TABLE_BY_NUMBER_PREFIX[(ref.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase()]
    return Array.from(new Set([lead, ...all].filter((t): t is string => Boolean(t))))
  }

  private async fetchBySysId(
    ctx: TicketProviderContext,
    table: string,
    sysId: string,
  ): Promise<ServiceNowRecord | null> {
    const res = await this.request(ctx, 'GET', `/api/now/table/${table}/${encodeURIComponent(sysId)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`ServiceNow get failed (${res.status}).`)
    return ((await res.json()) as { result?: ServiceNowRecord }).result ?? null
  }

  private async fetchByNumber(
    ctx: TicketProviderContext,
    table: string,
    number: string,
  ): Promise<ServiceNowRecord | null> {
    const params = new URLSearchParams({ sysparm_query: `number=${number}`, sysparm_limit: '1' })
    const res = await this.request(ctx, 'GET', `/api/now/table/${table}?${params.toString()}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`ServiceNow get failed (${res.status}).`)
    const records = ((await res.json()) as { result?: ServiceNowRecord[] }).result ?? []
    return records[0] ?? null
  }

  private composeDescription(input: CreateTicketInput): string {
    const parts = [input.description ?? '']
    if (input.canvasName || input.canvasId) {
      parts.push(`\n\n---\nRaised from Veltrix configuration "${input.canvasName ?? input.canvasId}".`)
    }
    return parts.join('')
  }

  private toTicketRef(ctx: TicketProviderContext, table: string, record: ServiceNowRecord): TicketRef {
    const base = normalizeInstanceUrl(ctx.instanceUrl)
    const sysId = String(record.sys_id ?? '')
    return {
      externalId: sysId,
      externalKey: record.number ? String(record.number) : null,
      url: sysId ? `${base}/${table}.do?sys_id=${sysId}` : null,
      title: record.short_description ? String(record.short_description) : null,
      status: record.state !== undefined ? String(record.state) : null,
      ticketType: table,
      raw: record,
    }
  }

  private request(
    ctx: TicketProviderContext,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${normalizeInstanceUrl(ctx.instanceUrl)}${path}`
    return fetch(url, {
      method,
      headers: {
        Authorization: authorizationHeader(ctx.auth),
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  }
}

function formatTransition(t: TicketStatusTransition): string {
  const label: Record<TicketStatusTransition['outcome'], string> = {
    deploy_started: 'Deployment started',
    deploy_succeeded: 'Deployment succeeded',
    deploy_failed: 'Deployment failed',
    rolled_back: 'Deployment rolled back',
  }
  return `[Veltrix] ${label[t.outcome]}${t.note ? `: ${t.note}` : ''}`
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500)
  } catch {
    return ''
  }
}

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/timeout|abort/i.test(msg)) return 'Timed out reaching ServiceNow. Check the instance URL and egress.'
  return `Could not reach ServiceNow: ${msg}`
}

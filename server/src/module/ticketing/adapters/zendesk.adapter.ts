// Zendesk adapter — implements TicketProvider against the Zendesk Support API
// (https://<subdomain>.zendesk.com/api/v2/tickets.json).
//
// Zendesk has a single `ticket` object (not typed change/incident/problem tables
// like ServiceNow); the platform's TicketType is carried as a Zendesk `type`
// field (question|incident|problem|task) where it maps, and otherwise recorded
// as a tag. `id` is the numeric externalId; the same value is the human number.
//
// Auth: API token as HTTP Basic "{email}/token:{apiToken}", or an OAuth2 bearer.
//
// NOTE: endpoint URLs + request/response shapes are real. Field mapping onto
// custom_fields / groups / forms is TODO — those are per-tenant and belong in
// the connection `config`.

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

// Zendesk `type` accepts a subset; `change` has no native equivalent → task.
const ZENDESK_TYPE_BY_TICKET_TYPE: Record<TicketType, string> = {
  change: 'task',
  incident: 'incident',
  problem: 'problem',
  task: 'task',
}

interface ZendeskTicket {
  id?: number
  subject?: string
  status?: string
  type?: string
  [key: string]: unknown
}

export class ZendeskAdapter implements TicketProvider {
  readonly provider = 'zendesk' as const

  supportedTicketTypes(): TicketType[] {
    return ['incident', 'problem', 'task', 'change']
  }

  getSensitiveFields(): string[] {
    return ['apiToken', 'accessToken', 'refreshToken', 'clientSecret']
  }

  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    // `email` is required for the api_token auth mode (used to build Basic auth);
    // when a Credential row supplies it, it may be absent from config.
    const email = config.email
    if (email !== undefined && typeof email !== 'string') {
      errors.push('email must be a string.')
    }
    return { valid: errors.length === 0, errors }
  }

  async testConnection(ctx: TicketProviderContext): Promise<TicketProviderTestResult> {
    const start = Date.now()
    try {
      // GET the current user — cheapest authenticated call.
      const res = await this.request(ctx, 'GET', '/api/v2/users/me.json')
      const latencyMs = Date.now() - start
      if (res.ok) return { success: true, message: 'Connected to Zendesk.', latencyMs }
      if (res.status === 401) {
        return { success: false, message: 'Zendesk rejected the credentials (401).', latencyMs }
      }
      return { success: false, message: `Zendesk returned ${res.status}.`, latencyMs }
    } catch (err) {
      return { success: false, message: describeError(err), latencyMs: Date.now() - start }
    }
  }

  async createTicket(ctx: TicketProviderContext, input: CreateTicketInput): Promise<TicketRef> {
    // TODO(ticketing): map input.fields onto custom_fields / group_id / brand_id
    // / ticket_form_id using the connection `config.fieldMap`.
    const ticket: Record<string, unknown> = {
      subject: input.summary,
      comment: { body: this.composeBody(input) },
      ...(input.ticketType ? { type: ZENDESK_TYPE_BY_TICKET_TYPE[input.ticketType] } : {}),
      ...(input.fields ?? {}),
    }
    const res = await this.request(ctx, 'POST', '/api/v2/tickets.json', { ticket })
    if (!res.ok) {
      throw new Error(`Zendesk create failed (${res.status}): ${await safeText(res)}`)
    }
    const created = ((await res.json()) as { ticket?: ZendeskTicket }).ticket ?? {}
    return this.toTicketRef(ctx, created)
  }

  async getTicket(ctx: TicketProviderContext, externalId: string): Promise<TicketRef | null> {
    const res = await this.request(ctx, 'GET', `/api/v2/tickets/${encodeURIComponent(externalId)}.json`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Zendesk get failed (${res.status}).`)
    const ticket = ((await res.json()) as { ticket?: ZendeskTicket }).ticket
    return ticket ? this.toTicketRef(ctx, ticket) : null
  }

  async searchTickets(ctx: TicketProviderContext, query: TicketSearchQuery): Promise<TicketRef[]> {
    // Zendesk unified search: type:ticket + optional keyword/status.
    const clauses = ['type:ticket']
    if (query.text) clauses.push(query.text)
    if (query.status) clauses.push(`status:${query.status}`)
    const params = new URLSearchParams({ query: clauses.join(' ') })
    const res = await this.request(ctx, 'GET', `/api/v2/search.json?${params.toString()}`)
    if (!res.ok) throw new Error(`Zendesk search failed (${res.status}).`)
    const results = ((await res.json()) as { results?: ZendeskTicket[] }).results ?? []
    const limit = Math.min(query.limit ?? 25, 100)
    return results.slice(0, limit).map((t) => this.toTicketRef(ctx, t))
  }

  async addComment(
    ctx: TicketProviderContext,
    externalId: string,
    body: string,
    _ticketType?: string | null,
  ): Promise<void> {
    // Zendesk has a single ticket surface, so the ticketType hint is not needed.
    const res = await this.request(ctx, 'PUT', `/api/v2/tickets/${encodeURIComponent(externalId)}.json`, {
      ticket: { comment: { body, public: false } },
    })
    if (!res.ok) throw new Error(`Zendesk comment failed (${res.status}).`)
  }

  async updateStatus(
    ctx: TicketProviderContext,
    externalId: string,
    transition: TicketStatusTransition,
    _ticketType?: string | null,
  ): Promise<void> {
    // Record the outcome as a private note; optionally solve on success.
    const status = transition.outcome === 'deploy_succeeded' ? 'solved' : undefined
    // TODO(ticketing): make the target status configurable per config.statusMap.
    const res = await this.request(ctx, 'PUT', `/api/v2/tickets/${encodeURIComponent(externalId)}.json`, {
      ticket: {
        comment: { body: formatTransition(transition), public: false },
        ...(status ? { status } : {}),
      },
    })
    if (!res.ok) throw new Error(`Zendesk status update failed (${res.status}).`)
  }

  // --- internals -------------------------------------------------------

  private composeBody(input: CreateTicketInput): string {
    const parts = [input.description ?? input.summary]
    if (input.canvasName || input.canvasId) {
      parts.push(`\n\n---\nRaised from Veltrix configuration "${input.canvasName ?? input.canvasId}".`)
    }
    return parts.join('')
  }

  private toTicketRef(ctx: TicketProviderContext, ticket: ZendeskTicket): TicketRef {
    const base = normalizeInstanceUrl(ctx.instanceUrl)
    const id = ticket.id !== undefined ? String(ticket.id) : ''
    return {
      externalId: id,
      externalKey: id ? `#${id}` : null,
      url: id ? `${base}/agent/tickets/${id}` : null,
      title: ticket.subject ? String(ticket.subject) : null,
      status: ticket.status ? String(ticket.status) : null,
      ticketType: ticket.type ? String(ticket.type) : 'ticket',
      raw: ticket,
    }
  }

  private request(
    ctx: TicketProviderContext,
    method: 'GET' | 'POST' | 'PUT',
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
  if (/timeout|abort/i.test(msg)) return 'Timed out reaching Zendesk. Check the subdomain URL and egress.'
  return `Could not reach Zendesk: ${msg}`
}

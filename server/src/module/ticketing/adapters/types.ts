// The TicketProvider abstraction every ticketing adapter implements.
//
// Mirrors the connectivity-provider / cloud-account adapter contract
// (validateConfig / testConnection / getSensitiveFields) and extends it with the
// ticket operations the platform needs for change & issue management:
// createTicket, getTicket, searchTickets, addComment, and an optional
// updateStatus used by the deploy lifecycle.
//
// Provider specifics (ServiceNow Table API, Zendesk API) live ONLY inside the
// concrete adapters — the platform code stays generic. Adding a 3rd provider is
// a new file here + one registry entry.

import type { TicketingProviderId, TicketType } from '../ticketing.schema'

/**
 * Decrypted, ready-to-use connection material handed to an adapter. Assembled by
 * the service from the tenant's TicketingConnection (its instanceUrl + config)
 * and its resolved secret (from a Credential row via decryptCredentialSecrets,
 * or from encrypted config fields). SERVER-SIDE ONLY — never serialized to a
 * client; carries live secrets.
 */
export interface TicketProviderContext {
  instanceUrl: string
  auth: TicketAuth
  /** Non-secret provider config: default table/ticket type, brand id, custom-field map. */
  config: Record<string, unknown>
}

/** Auth material, discriminated by kind. */
export type TicketAuth =
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'apiToken'; email: string; apiToken: string } // Zendesk: {email}/token
  | { kind: 'bearer'; token: string } // OAuth2 access token

export interface CreateTicketInput {
  summary: string
  description?: string
  ticketType?: TicketType
  /** Provider-native extra fields (priority, category, assignment group…). */
  fields?: Record<string, unknown>
  /** Correlation back to the originating configuration canvas (for the body/refs). */
  canvasId?: string
  canvasName?: string
}

/** Normalized, wire-safe representation of a provider ticket. */
export interface TicketRef {
  /** Provider-native stable id (ServiceNow sys_id, Zendesk numeric id). */
  externalId: string
  /** Human-facing number (CHG0030001 / INC0010023 / #4521). */
  externalKey?: string | null
  /** Deep link to the ticket in the provider UI. */
  url?: string | null
  title?: string | null
  status?: string | null
  ticketType?: string | null
  /** Untyped raw payload for callers that need provider-specific fields. */
  raw?: unknown
}

export interface TicketSearchQuery {
  text?: string
  ticketType?: TicketType
  status?: string
  limit?: number
}

export interface TicketProviderTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

/**
 * Platform-normalized deploy outcome. The adapter maps it onto a provider state
 * transition and/or a comment. Optional on the interface so a provider that
 * cannot transition tickets simply omits it.
 */
export interface TicketStatusTransition {
  outcome: 'deploy_started' | 'deploy_succeeded' | 'deploy_failed' | 'rolled_back'
  note?: string
}

export interface TicketProvider {
  readonly provider: TicketingProviderId

  /** Ticket categories this provider can create (guards create requests). */
  supportedTicketTypes(): TicketType[]

  /** Config field names holding secrets — masked on read, encrypted on write. */
  getSensitiveFields(): string[]

  /** Validate the non-secret config shape. Returns human-readable errors. */
  validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] }

  /** Live probe: a cheap authenticated GET proving instanceUrl + auth work. */
  testConnection(ctx: TicketProviderContext): Promise<TicketProviderTestResult>

  /** Create a ticket and return its normalized ref. */
  createTicket(ctx: TicketProviderContext, input: CreateTicketInput): Promise<TicketRef>

  /** Fetch one ticket by provider-native id. Returns null if it does not exist. */
  getTicket(ctx: TicketProviderContext, externalId: string): Promise<TicketRef | null>

  /** Search tickets (used by the "link existing" picker). */
  searchTickets(ctx: TicketProviderContext, query: TicketSearchQuery): Promise<TicketRef[]>

  /**
   * Append a comment / work note (used to record deploy/approval events).
   * `ticketType` is the linked ticket's provider-native type/table (e.g. the
   * ServiceNow "incident" vs "change_request"), passed so the adapter targets the
   * RIGHT table instead of falling back to its configured default. Providers with
   * a single ticket surface (Zendesk) ignore it.
   */
  addComment(
    ctx: TicketProviderContext,
    externalId: string,
    body: string,
    ticketType?: string | null,
  ): Promise<void>

  /** Optional: reflect a deploy outcome onto the ticket (change management). */
  updateStatus?(
    ctx: TicketProviderContext,
    externalId: string,
    transition: TicketStatusTransition,
    ticketType?: string | null,
  ): Promise<void>
}

// --- Small shared helpers for adapters ---------------------------------

/** Is a string field present + non-empty on config? Pushes a readable error. */
export function requireField(
  config: Record<string, unknown>,
  field: string,
  errors: string[],
  label?: string,
): void {
  const v = config[field]
  if (typeof v !== 'string' || v.trim() === '') {
    errors.push(`${label ?? field} is required.`)
  }
}

/** Build the HTTP Authorization header value for a given auth mode. */
export function authorizationHeader(auth: TicketAuth): string {
  switch (auth.kind) {
    case 'basic':
      return `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
    case 'apiToken':
      // Zendesk: base64("{email}/token:{apiToken}").
      return `Basic ${Buffer.from(`${auth.email}/token:${auth.apiToken}`).toString('base64')}`
    case 'bearer':
      return `Bearer ${auth.token}`
  }
}

/** Normalize a tenant instance URL to an origin with no trailing slash. */
export function normalizeInstanceUrl(instanceUrl: string): string {
  return instanceUrl.trim().replace(/\/+$/, '')
}

export const DEFAULT_TIMEOUT_MS = 10_000

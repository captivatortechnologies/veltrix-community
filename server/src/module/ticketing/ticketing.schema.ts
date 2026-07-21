// Ticketing connection types + JSON schemas.
//
// A TicketingConnection is a PER-TENANT configuration of an external ticketing
// system (ServiceNow, Zendesk). Mirrors the connectivity-provider / cloud-account
// module shape: `provider` is a plain string (the enum lives here in TS, not in
// Prisma, so a 3rd provider is just a new adapter — no migration), `config` is a
// Json blob whose sensitive fields are encrypted at rest and masked on read.
//
// Pure DTO types are shared with the client via ../../../../shared/types/ticketing.

import type {
  TicketingProviderId,
  TicketingConnectionStatus,
  TicketType,
  TicketLinkType,
} from '../../../../shared/types/ticketing'

export type {
  TicketingProviderId,
  TicketingConnectionStatus,
  TicketType,
  TicketLinkType,
}

// --- Runtime enums (source of truth for validation + Swagger) ----------

export const TICKETING_PROVIDERS = ['servicenow', 'zendesk'] as const
export const TICKET_TYPES = ['change', 'incident', 'problem', 'task'] as const
export const TICKET_LINK_TYPES = ['change', 'issue'] as const

/**
 * Auth methods per provider. Kept in TS so a new provider/auth pairing is a code
 * change, not a schema change. ServiceNow: basic (user/pass) or OAuth2 bearer.
 * Zendesk: email + API token, or OAuth2 bearer.
 */
export const TICKETING_AUTH_METHODS = ['basic', 'api_token', 'oauth2'] as const
export type TicketingAuthMethod = (typeof TICKETING_AUTH_METHODS)[number]

export const PROVIDER_AUTH_METHODS: Record<TicketingProviderId, TicketingAuthMethod[]> = {
  servicenow: ['basic', 'oauth2'],
  zendesk: ['api_token', 'oauth2'],
}

/**
 * Config keys that hold SECRETS for a given provider+authMethod. These are the
 * fields encryptFields/decryptFields act on and the service masks on read.
 * (Used only when secrets are stored inline in `config`; when a `credentialId`
 * is set the secret is resolved from the Credential row instead.)
 */
export function sensitiveConfigFields(
  provider: TicketingProviderId,
  authMethod: TicketingAuthMethod,
): string[] {
  if (authMethod === 'oauth2') return ['accessToken', 'refreshToken', 'clientSecret']
  if (provider === 'servicenow') return ['password']
  if (provider === 'zendesk') return ['apiToken']
  return []
}

// --- Fastify / Swagger JSON schemas (mirror cloud-account.schema.ts) ----

export const ticketingConnectionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    provider: { type: 'string', enum: [...TICKETING_PROVIDERS] },
    name: { type: 'string' },
    instanceUrl: { type: 'string' },
    credentialId: { type: ['string', 'null'] },
    isDefault: { type: 'boolean' },
    isEnabled: { type: 'boolean' },
    config: { type: 'object', additionalProperties: true },
    status: { type: 'string' },
    statusMessage: { type: ['string', 'null'] },
    lastTestedAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const

export const ticketingConnectionListSchema = {
  type: 'array',
  items: ticketingConnectionResponseSchema,
} as const

export const createTicketingConnectionBodySchema = {
  type: 'object',
  required: ['provider', 'name', 'instanceUrl', 'config'],
  properties: {
    provider: { type: 'string', enum: [...TICKETING_PROVIDERS] },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    instanceUrl: { type: 'string', minLength: 1, maxLength: 500 },
    credentialId: { type: ['string', 'null'] },
    config: { type: 'object', additionalProperties: true },
    isDefault: { type: 'boolean' },
    isEnabled: { type: 'boolean' },
  },
} as const

export const updateTicketingConnectionBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    instanceUrl: { type: 'string', minLength: 1, maxLength: 500 },
    credentialId: { type: ['string', 'null'] },
    config: { type: 'object', additionalProperties: true },
    isDefault: { type: 'boolean' },
    isEnabled: { type: 'boolean' },
  },
} as const

export const testTicketingConnectionResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    latencyMs: { type: 'number' },
  },
} as const

export const ticketLinkResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    canvasId: { type: 'string' },
    connectionId: { type: ['string', 'null'] },
    provider: { type: 'string', enum: [...TICKETING_PROVIDERS] },
    externalId: { type: 'string' },
    externalKey: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
    ticketType: { type: ['string', 'null'] },
    title: { type: ['string', 'null'] },
    status: { type: ['string', 'null'] },
    linkType: { type: 'string', enum: [...TICKET_LINK_TYPES] },
    createdById: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const

export const ticketLinkListSchema = {
  type: 'array',
  items: ticketLinkResponseSchema,
} as const

export const createTicketForCanvasBodySchema = {
  type: 'object',
  required: ['summary'],
  properties: {
    connectionId: { type: 'string' },
    summary: { type: 'string', minLength: 1, maxLength: 500 },
    description: { type: 'string' },
    ticketType: { type: 'string', enum: [...TICKET_TYPES] },
    linkType: { type: 'string', enum: [...TICKET_LINK_TYPES] },
    fields: { type: 'object', additionalProperties: true },
  },
} as const

export const linkExistingTicketBodySchema = {
  type: 'object',
  required: ['externalRef'],
  properties: {
    connectionId: { type: 'string' },
    externalRef: { type: 'string', minLength: 1 },
    linkType: { type: 'string', enum: [...TICKET_LINK_TYPES] },
  },
} as const

export const successMessageSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
} as const

export const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

/** Guard: is a string a supported provider id? */
export function isTicketingProvider(value: string): value is TicketingProviderId {
  return (TICKETING_PROVIDERS as readonly string[]).includes(value)
}

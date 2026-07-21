import type { TicketingProviderId } from '@/services/ticketingProviderApi'

// ---------------------------------------------------------------------------
// Per-provider config field definitions for the ticketing connection dialog.
// Field names are chosen to match the server's authoritative sources EXACTLY:
//   - server/src/module/ticketing/ticketing.schema.ts: TICKETING_AUTH_METHODS,
//     PROVIDER_AUTH_METHODS, sensitiveConfigFields(provider, authMethod)
//   - server/src/module/ticketing/ticketing.service.ts: authMethodOf/resolveAuth
//     (reads config.username/password, config.email/apiToken, config.accessToken)
//   - server/src/module/ticketing/adapters/servicenow.adapter.ts: config.defaultTable
// ---------------------------------------------------------------------------

export type TicketingAuthMethod = 'basic' | 'api_token' | 'oauth2'

export interface TicketingFieldDefinition {
  name: string
  label: string
  type: 'text' | 'password' | 'textarea' | 'number' | 'select'
  placeholder?: string
  required?: boolean
  helpText?: string
  options?: { value: string; label: string }[]
  /** Only rendered while the named field (usually `authMethod`) holds this value. */
  showWhen?: { field: string; equals: string }
}

export interface TicketingProviderSchema {
  provider: TicketingProviderId
  displayName: string
  shortDescription: string
  description: string
  icon: string // emoji for now — mirrors providerSchemas.ts's convention
  authMethods: TicketingAuthMethod[]
  defaultAuthMethod: TicketingAuthMethod
  fields: TicketingFieldDefinition[]
}

// ---------------------------------------------------------------------------
// ServiceNow — Table API, Basic (service account) or OAuth2 bearer.
// ---------------------------------------------------------------------------

const serviceNowSchema: TicketingProviderSchema = {
  provider: 'servicenow',
  displayName: 'ServiceNow',
  shortDescription: 'Change, incident, problem & task management',
  description:
    'Create and link change requests, incidents, problems, or tasks in your ServiceNow instance via the Table API.',
  icon: '🎫',
  authMethods: ['basic', 'oauth2'],
  defaultAuthMethod: 'basic',
  fields: [
    {
      name: 'authMethod',
      label: 'Authentication Method',
      type: 'select',
      required: true,
      options: [
        { value: 'basic', label: 'Basic (service account username/password)' },
        { value: 'oauth2', label: 'OAuth 2.0 (bearer token)' },
      ],
      helpText: 'How the platform authenticates its API calls to this instance.',
    },
    {
      name: 'username',
      label: 'Username',
      type: 'text',
      required: true,
      placeholder: 'svc-veltrix',
      helpText: 'Service account with API access to the target table(s).',
      showWhen: { field: 'authMethod', equals: 'basic' },
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      required: true,
      helpText: 'Service account password.',
      showWhen: { field: 'authMethod', equals: 'basic' },
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      helpText: 'OAuth application client ID (used for future automatic token refresh).',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      helpText: 'OAuth application client secret.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      helpText: 'Bearer token used directly for API calls.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'refreshToken',
      label: 'Refresh Token',
      type: 'password',
      helpText: 'Optional — enables automatic token refresh once implemented.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'defaultTable',
      label: 'Default Table',
      type: 'select',
      helpText: 'Table used to create a ticket when no ticket type is specified.',
      options: [
        { value: 'change_request', label: 'Change Request' },
        { value: 'incident', label: 'Incident' },
        { value: 'problem', label: 'Problem' },
        { value: 'task', label: 'Task' },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Zendesk — Support API, email+API token (Basic) or OAuth2 bearer.
// ---------------------------------------------------------------------------

const zendeskSchema: TicketingProviderSchema = {
  provider: 'zendesk',
  displayName: 'Zendesk',
  shortDescription: 'Ticket-based issue tracking',
  description:
    'Create and link Zendesk support tickets to track changes and issues raised from your configurations.',
  icon: '🎟️',
  authMethods: ['api_token', 'oauth2'],
  defaultAuthMethod: 'api_token',
  fields: [
    {
      name: 'authMethod',
      label: 'Authentication Method',
      type: 'select',
      required: true,
      options: [
        { value: 'api_token', label: 'Email + API Token' },
        { value: 'oauth2', label: 'OAuth 2.0 (bearer token)' },
      ],
      helpText: 'How the platform authenticates its API calls to this instance.',
    },
    {
      name: 'email',
      label: 'Agent Email',
      type: 'text',
      required: true,
      placeholder: 'ops@example.com',
      helpText: 'The Zendesk agent account the API token belongs to.',
      showWhen: { field: 'authMethod', equals: 'api_token' },
    },
    {
      name: 'apiToken',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText: 'Generated under Admin Center → Apps and integrations → APIs.',
      showWhen: { field: 'authMethod', equals: 'api_token' },
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      helpText: 'OAuth application client ID (used for future automatic token refresh).',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      helpText: 'OAuth application client secret.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'accessToken',
      label: 'Access Token',
      type: 'password',
      required: true,
      helpText: 'Bearer token used directly for API calls.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
    {
      name: 'refreshToken',
      label: 'Refresh Token',
      type: 'password',
      helpText: 'Optional — enables automatic token refresh once implemented.',
      showWhen: { field: 'authMethod', equals: 'oauth2' },
    },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TICKETING_PROVIDER_SCHEMAS: Record<TicketingProviderId, TicketingProviderSchema> = {
  servicenow: serviceNowSchema,
  zendesk: zendeskSchema,
}

/** All provider schemas, ordered for display. */
export function getTicketingProviderSchemaList(): TicketingProviderSchema[] {
  return [serviceNowSchema, zendeskSchema]
}

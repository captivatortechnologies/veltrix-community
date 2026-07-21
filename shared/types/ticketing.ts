// ========================================================================
// Ticketing Integration — Change & Issue Management
// Shared between server, client, and (potentially) tooling.
//
// A TicketingConnection is a PER-TENANT configuration of an external ticketing
// system (ServiceNow, Zendesk, …) the tenant selects and configures. Sensitive
// auth material is encrypted at rest via the platform's existing credential
// crypto (server/src/utils/encryption.ts) — never invented here. These types
// carry only NON-secret, wire-safe shapes: secrets are always masked before a
// connection leaves the server.
//
// A ConfigurationTicketLink ties a configuration canvas (a change) to an
// external ticket (change_request / incident / Zendesk ticket) for change &
// issue management.
// ========================================================================

// --- Provider identity -------------------------------------------------

/**
 * Providers supported today. Modelled as a string-union (not a Prisma enum) so
 * adding a third provider is a new adapter + one array entry — no DB migration.
 * Mirrors the platform's CLOUD_PROVIDERS / ConnectivityProvider.providerType
 * convention.
 */
export type TicketingProviderId = 'servicenow' | 'zendesk'

/** Test/config lifecycle, mirrors ConnectivityProvider.status. */
export type TicketingConnectionStatus =
  | 'UNCONFIGURED'
  | 'CONFIGURED'
  | 'CONNECTED'
  | 'ERROR'

/**
 * Normalized ticket categories the platform understands. Each adapter maps
 * these onto its provider-native object (ServiceNow table, Zendesk ticket).
 */
export type TicketType = 'change' | 'incident' | 'problem' | 'task'

/** Whether a canvas↔ticket link is for change-management or issue-tracking. */
export type TicketLinkType = 'change' | 'issue'

// --- Tenant connection (provider config) -------------------------------

/** Wire-safe connection record. Sensitive `config` fields are masked. */
export interface TicketingConnectionDTO {
  id: string
  customerId: string
  provider: TicketingProviderId
  name: string
  instanceUrl: string
  /** Optional platform Credential this connection resolves its secret from. */
  credentialId: string | null
  isDefault: boolean
  isEnabled: boolean
  /** Non-secret provider config; any sensitive keys are masked (••••••). */
  config: Record<string, unknown>
  status: TicketingConnectionStatus
  statusMessage: string | null
  lastTestedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTicketingConnectionRequest {
  provider: TicketingProviderId
  name: string
  instanceUrl: string
  /** Provide EITHER credentialId (reuse a platform Credential) OR inline
   *  secrets inside `config` (encrypted at rest). */
  credentialId?: string | null
  config: Record<string, unknown>
  isDefault?: boolean
  isEnabled?: boolean
}

export interface UpdateTicketingConnectionRequest {
  name?: string
  instanceUrl?: string
  credentialId?: string | null
  config?: Record<string, unknown>
  isDefault?: boolean
  isEnabled?: boolean
}

export interface TestTicketingConnectionResponse {
  success: boolean
  message: string
  latencyMs?: number
}

// --- Canvas ↔ ticket link ---------------------------------------------

/** A link between a configuration canvas and an external ticket. */
export interface ConfigurationTicketLinkDTO {
  id: string
  canvasId: string
  connectionId: string | null
  provider: TicketingProviderId
  externalId: string
  externalKey: string | null
  url: string | null
  ticketType: string | null
  title: string | null
  status: string | null
  linkType: TicketLinkType
  createdById: string
  createdAt: string
  updatedAt: string
}

/** Create a NEW ticket in the tenant's provider and link it to the canvas. */
export interface CreateTicketForCanvasRequest {
  /** Which configured connection to create the ticket in; defaults to the
   *  tenant's default connection when omitted. */
  connectionId?: string
  summary: string
  description?: string
  ticketType?: TicketType
  linkType?: TicketLinkType
  /** Provider-native extra fields (priority, category, assignment group…). */
  fields?: Record<string, unknown>
}

/** Link an EXISTING external ticket (by id/number/URL) to the canvas. */
export interface LinkExistingTicketRequest {
  connectionId?: string
  /** The provider-native id or number the user pasted (sys_id, CHG0030001, #4521). */
  externalRef: string
  linkType?: TicketLinkType
}

// --- Change/issue management policy (optional gate) --------------------

/**
 * Per-tenant policy controlling whether a linked ticket is required before a
 * deploy, and whether the platform reflects deploy outcomes back onto the
 * ticket. Stored on the TicketingConnection.config or a platform-config row;
 * entirely optional so existing deploys are unaffected.
 */
export interface TicketingChangePolicy {
  /** Require an OPEN change link on the canvas before it can be deployed. */
  requireTicketForDeploy?: boolean
  /** Only enforce the gate for these environment tag ids (e.g. prod). */
  enforcedEnvironmentTagIds?: string[]
  /** Post deploy start/success/failure as a comment / status update. */
  reflectDeployStatus?: boolean
}

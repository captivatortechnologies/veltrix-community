// Ticketing service — per-tenant connection CRUD + canvas↔ticket links.
//
// Mirrors cloud-account.service.ts: encrypt-on-write / decrypt-then-mask-on-read
// for inline secrets, transactional isDefault handling, and a testConnection that
// persists status. Ticket operations are delegated to the provider adapter
// resolved from the registry.
//
// SECRETS: this service NEVER invents crypto. Secrets resolve two ways, both
// reusing server/src/utils/encryption.ts:
//   1. `credentialId` set  -> the secret lives in a platform Credential row;
//      decrypted via credentialService.decryptCredentialSecrets.
//   2. otherwise           -> secrets live inline in `config`, encrypted with
//      encryptFields and decrypted with decryptFields.
//
// COMPILES after the TicketingConnection + ConfigurationTicketLink models are
// added to schema.prisma and `npx prisma generate` is run (see
// _ai_tasks/ticketing-integration/plan.md). Until then `prisma.ticketingConnection`
// and `prisma.configurationTicketLink` do not exist on the generated client.

import prisma from '../../db'
import { Prisma } from '@prisma/client'
import { loggerService } from '../logger/logger.service'
import { encryptFields, decryptFields } from '../../utils/encryption'
import { decryptCredentialSecrets } from '../credential/credential.service'
import { getTicketProvider } from './adapters'
import type { TicketProviderContext, TicketAuth, CreateTicketInput, TicketStatusTransition } from './adapters'
import {
  TicketingProviderId,
  TicketingAuthMethod,
  isTicketingProvider,
  sensitiveConfigFields,
} from './ticketing.schema'
import type {
  TicketingConnectionDTO,
  ConfigurationTicketLinkDTO,
  CreateTicketingConnectionRequest,
  UpdateTicketingConnectionRequest,
  CreateTicketForCanvasRequest,
  LinkExistingTicketRequest,
  TestTicketingConnectionResponse,
} from '../../../../shared/types/ticketing'

// ---------------------------------------------------------------------------
// Types for the raw persisted row (Prisma model, once generated).
// ---------------------------------------------------------------------------

type TicketingConnectionRow = {
  id: string
  customerId: string
  provider: string
  name: string
  instanceUrl: string
  credentialId: string | null
  isDefault: boolean
  isEnabled: boolean
  config: unknown
  status: string
  statusMessage: string | null
  lastTestedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Masking / (de)serialization helpers
// ---------------------------------------------------------------------------

function maskSensitiveConfig(config: Record<string, unknown>, sensitiveFields: string[]): Record<string, unknown> {
  const masked = { ...config }
  for (const field of sensitiveFields) {
    if (typeof masked[field] === 'string' && (masked[field] as string).length > 0) {
      const v = masked[field] as string
      masked[field] = `••••••${v.length >= 4 ? v.slice(-4) : ''}`
    }
  }
  return masked
}

function authMethodOf(config: Record<string, unknown>, provider: TicketingProviderId): TicketingAuthMethod {
  const m = config.authMethod
  if (m === 'basic' || m === 'api_token' || m === 'oauth2') return m
  return provider === 'zendesk' ? 'api_token' : 'basic'
}

function decryptConfig(row: TicketingConnectionRow): Record<string, unknown> {
  const config = (row.config ?? {}) as Record<string, unknown>
  const method = authMethodOf(config, row.provider as TicketingProviderId)
  return decryptFields(config, sensitiveConfigFields(row.provider as TicketingProviderId, method)) as Record<string, unknown>
}

function toPublicRecord(row: TicketingConnectionRow): TicketingConnectionDTO {
  const decrypted = decryptConfig(row)
  const method = authMethodOf(decrypted, row.provider as TicketingProviderId)
  const masked = maskSensitiveConfig(decrypted, sensitiveConfigFields(row.provider as TicketingProviderId, method))
  return {
    id: row.id,
    customerId: row.customerId,
    provider: row.provider as TicketingProviderId,
    name: row.name,
    instanceUrl: row.instanceUrl,
    credentialId: row.credentialId,
    isDefault: row.isDefault,
    isEnabled: row.isEnabled,
    config: masked,
    status: row.status as TicketingConnectionDTO['status'],
    statusMessage: row.statusMessage,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toLinkDTO(row: any): ConfigurationTicketLinkDTO {
  return {
    id: row.id,
    canvasId: row.canvasId,
    connectionId: row.connectionId,
    provider: row.provider,
    externalId: row.externalId,
    externalKey: row.externalKey,
    url: row.url,
    ticketType: row.ticketType,
    title: row.title,
    status: row.status,
    linkType: row.linkType,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Secret resolution → a decrypted TicketProviderContext for the adapter.
// Server-side only; NEVER returned over HTTP.
// ---------------------------------------------------------------------------

async function buildProviderContext(row: TicketingConnectionRow): Promise<TicketProviderContext> {
  const provider = row.provider as TicketingProviderId
  const config = decryptConfig(row)
  const method = authMethodOf(config, provider)

  // Resolve the secret from the linked Credential when present, else from config.
  let cred: { username?: string; password?: string | null; apiToken?: string | null } | null = null
  if (row.credentialId) {
    const raw = await prisma.credential.findUnique({ where: { id: row.credentialId } })
    cred = raw ? decryptCredentialSecrets(raw) : null
  }

  const auth = resolveAuth(provider, method, config, cred)
  return { instanceUrl: row.instanceUrl, auth, config }
}

function resolveAuth(
  provider: TicketingProviderId,
  method: TicketingAuthMethod,
  config: Record<string, unknown>,
  cred: { username?: string; password?: string | null; apiToken?: string | null } | null,
): TicketAuth {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  if (method === 'oauth2') {
    return { kind: 'bearer', token: cred?.apiToken || str(config.accessToken) }
  }
  if (provider === 'zendesk') {
    return {
      kind: 'apiToken',
      email: cred?.username || str(config.email),
      apiToken: cred?.apiToken || str(config.apiToken),
    }
  }
  // ServiceNow basic.
  return {
    kind: 'basic',
    username: cred?.username || str(config.username),
    password: cred?.password || str(config.password),
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ticketingService = {
  // --- Connection CRUD -------------------------------------------------

  async listConnections(customerId: string): Promise<TicketingConnectionDTO[]> {
    const rows = await prisma.ticketingConnection.findMany({
      where: { customerId },
      orderBy: [{ provider: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    })
    return rows.map(toPublicRecord)
  },

  async getConnection(id: string, customerId: string): Promise<TicketingConnectionDTO> {
    const row = await prisma.ticketingConnection.findFirst({ where: { id, customerId } })
    if (!row) throw new Error('Ticketing connection not found')
    return toPublicRecord(row)
  },

  async createConnection(customerId: string, data: CreateTicketingConnectionRequest): Promise<TicketingConnectionDTO> {
    if (!isTicketingProvider(data.provider)) throw new Error(`Invalid provider "${data.provider}".`)
    const adapter = getTicketProvider(data.provider)
    const validation = adapter.validateConfig(data.config ?? {})
    if (!validation.valid) throw new Error(`Invalid configuration: ${validation.errors.join('; ')}`)

    const method = authMethodOf(data.config ?? {}, data.provider)
    const encrypted = encryptFields(data.config ?? {}, sensitiveConfigFields(data.provider, method))

    const row = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.ticketingConnection.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.ticketingConnection.create({
        data: {
          customerId,
          provider: data.provider,
          name: data.name,
          instanceUrl: data.instanceUrl,
          credentialId: data.credentialId ?? null,
          config: encrypted as Prisma.InputJsonValue,
          isDefault: data.isDefault ?? false,
          isEnabled: data.isEnabled ?? true,
          status: 'UNCONFIGURED',
        },
      })
    })
    return toPublicRecord(row)
  },

  async updateConnection(
    id: string,
    customerId: string,
    data: UpdateTicketingConnectionRequest,
  ): Promise<TicketingConnectionDTO> {
    const existing = await prisma.ticketingConnection.findFirst({ where: { id, customerId } })
    if (!existing) throw new Error('Ticketing connection not found')

    let encrypted: Record<string, unknown> | undefined
    if (data.config !== undefined) {
      const adapter = getTicketProvider(existing.provider)
      const validation = adapter.validateConfig(data.config)
      if (!validation.valid) throw new Error(`Invalid configuration: ${validation.errors.join('; ')}`)
      const method = authMethodOf(data.config, existing.provider as TicketingProviderId)
      encrypted = encryptFields(data.config, sensitiveConfigFields(existing.provider as TicketingProviderId, method))
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.ticketingConnection.updateMany({
          where: { customerId, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.ticketingConnection.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.instanceUrl !== undefined && { instanceUrl: data.instanceUrl }),
          ...(data.credentialId !== undefined && { credentialId: data.credentialId }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
          ...(encrypted !== undefined && {
            config: encrypted as Prisma.InputJsonValue,
            status: 'UNCONFIGURED',
            statusMessage: null,
          }),
        },
      })
    })
    return toPublicRecord(updated)
  },

  async deleteConnection(id: string, customerId: string): Promise<{ message: string }> {
    const existing = await prisma.ticketingConnection.findFirst({ where: { id, customerId } })
    if (!existing) throw new Error('Ticketing connection not found')
    await prisma.ticketingConnection.delete({ where: { id } })
    return { message: 'Ticketing connection deleted successfully' }
  },

  async testConnection(id: string, customerId: string): Promise<TestTicketingConnectionResponse> {
    const row = await prisma.ticketingConnection.findFirst({ where: { id, customerId } })
    if (!row) throw new Error('Ticketing connection not found')

    const adapter = getTicketProvider(row.provider)
    const ctx = await buildProviderContext(row)
    const result = await adapter.testConnection(ctx)

    await prisma.ticketingConnection.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        status: result.success ? 'CONNECTED' : 'ERROR',
        statusMessage: result.message,
      },
    })
    return { success: result.success, message: result.message, latencyMs: result.latencyMs }
  },

  // --- Canvas ↔ ticket links ------------------------------------------

  async listLinksForCanvas(canvasId: string, customerId: string): Promise<ConfigurationTicketLinkDTO[]> {
    const rows = await prisma.configurationTicketLink.findMany({
      where: { canvasId, customerId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toLinkDTO)
  },

  /** Create a NEW ticket in the tenant's provider and link it to the canvas. */
  async createTicketForCanvas(
    canvasId: string,
    customerId: string,
    userId: string,
    data: CreateTicketForCanvasRequest,
  ): Promise<ConfigurationTicketLinkDTO> {
    const canvas = await prisma.configurationCanvas.findFirst({ where: { id: canvasId, customerId } })
    if (!canvas) throw new Error('Configuration not found')

    const row = await this.resolveConnectionRow(customerId, data.connectionId)
    const adapter = getTicketProvider(row.provider)
    const ctx = await buildProviderContext(row)

    const input: CreateTicketInput = {
      summary: data.summary,
      description: data.description,
      ticketType: data.ticketType,
      fields: data.fields,
      canvasId: canvas.id,
      canvasName: canvas.name,
    }
    const ticket = await adapter.createTicket(ctx, input)

    const link = await prisma.configurationTicketLink.create({
      data: {
        canvasId,
        customerId,
        connectionId: row.id,
        provider: row.provider,
        externalId: ticket.externalId,
        externalKey: ticket.externalKey ?? null,
        url: ticket.url ?? null,
        ticketType: ticket.ticketType ?? data.ticketType ?? null,
        title: ticket.title ?? data.summary,
        status: ticket.status ?? null,
        linkType: data.linkType ?? 'change',
        createdById: userId,
      },
    })
    return toLinkDTO(link)
  },

  /** Link an EXISTING external ticket to the canvas (by native id/number). */
  async linkExistingTicket(
    canvasId: string,
    customerId: string,
    userId: string,
    data: LinkExistingTicketRequest,
  ): Promise<ConfigurationTicketLinkDTO> {
    const canvas = await prisma.configurationCanvas.findFirst({ where: { id: canvasId, customerId } })
    if (!canvas) throw new Error('Configuration not found')

    const row = await this.resolveConnectionRow(customerId, data.connectionId)
    const adapter = getTicketProvider(row.provider)
    const ctx = await buildProviderContext(row)

    const ticket = await adapter.getTicket(ctx, data.externalRef.trim())
    if (!ticket) throw new Error(`No ticket found for "${data.externalRef}" in ${row.provider}.`)

    const link = await prisma.configurationTicketLink.create({
      data: {
        canvasId,
        customerId,
        connectionId: row.id,
        provider: row.provider,
        externalId: ticket.externalId,
        externalKey: ticket.externalKey ?? null,
        url: ticket.url ?? null,
        ticketType: ticket.ticketType ?? null,
        title: ticket.title ?? null,
        status: ticket.status ?? null,
        linkType: data.linkType ?? 'change',
        createdById: userId,
      },
    })
    return toLinkDTO(link)
  },

  async unlink(linkId: string, customerId: string): Promise<{ message: string }> {
    const link = await prisma.configurationTicketLink.findFirst({ where: { id: linkId, customerId } })
    if (!link) throw new Error('Ticket link not found')
    await prisma.configurationTicketLink.delete({ where: { id: linkId } })
    return { message: 'Ticket link removed' }
  },

  // --- Change/issue management: deploy lifecycle hook ------------------

  /**
   * Reflect a deploy outcome onto every ticket linked to a canvas. Best-effort:
   * failures are logged and swallowed so ticketing is NEVER able to break a
   * deploy. Called from the DeploymentOrchestrator (see plan.md, task 6).
   */
  async reflectDeployStatus(
    canvasId: string,
    customerId: string,
    transition: TicketStatusTransition,
  ): Promise<void> {
    let links: any[]
    try {
      links = await prisma.configurationTicketLink.findMany({ where: { canvasId, customerId, linkType: 'change' } })
    } catch (err) {
      loggerService.warn('[ticketing] could not load ticket links for deploy reflection', err)
      return
    }
    for (const link of links) {
      try {
        if (!link.connectionId) continue
        const row = await prisma.ticketingConnection.findFirst({ where: { id: link.connectionId, customerId } })
        if (!row || !row.isEnabled) continue
        const adapter = getTicketProvider(row.provider)
        const ctx = await buildProviderContext(row)
        if (adapter.updateStatus) {
          await adapter.updateStatus(ctx, link.externalId, transition)
        } else {
          await adapter.addComment(ctx, link.externalId, `[Veltrix] ${transition.outcome}`)
        }
      } catch (err) {
        loggerService.warn(`[ticketing] failed to reflect deploy status to ticket ${link.externalId}`, err)
      }
    }
  },

  /**
   * Add a Veltrix activity comment to EVERY ticket linked to a canvas, reflecting
   * a lifecycle action (validate / edit / submit / approve / reject / rollback …)
   * so the linked change/issue ticket carries the full audit trail. Best-effort
   * and fully isolated: any failure is logged and swallowed, so ticketing can
   * never affect the action that triggered it. Fire-and-forget from callers.
   */
  async reflectActivity(canvasId: string, customerId: string, note: string): Promise<void> {
    let links: any[]
    try {
      links = await prisma.configurationTicketLink.findMany({ where: { canvasId, customerId } })
    } catch (err) {
      loggerService.warn('[ticketing] could not load ticket links for activity reflection', err)
      return
    }
    for (const link of links) {
      try {
        if (!link.connectionId) continue
        const row = await prisma.ticketingConnection.findFirst({ where: { id: link.connectionId, customerId } })
        if (!row || !row.isEnabled) continue
        const adapter = getTicketProvider(row.provider)
        const ctx = await buildProviderContext(row)
        await adapter.addComment(ctx, link.externalId, `[Veltrix] ${note}`)
      } catch (err) {
        loggerService.warn(`[ticketing] failed to reflect activity to ticket ${link.externalId}`, err)
      }
    }
  },

  /**
   * Whether a canvas has at least one OPEN change link — used by the optional
   * "require ticket before deploy" gate. Kept here so the pipeline can call one
   * method; policy lookup (which environments enforce it) lives in the caller.
   */
  async hasOpenChangeLink(canvasId: string, customerId: string): Promise<boolean> {
    const count = await prisma.configurationTicketLink.count({
      where: { canvasId, customerId, linkType: 'change' },
    })
    return count > 0
  },

  // --- internals -------------------------------------------------------

  /** Resolve the connection to use: the given id, else the tenant default, else error. */
  async resolveConnectionRow(customerId: string, connectionId?: string): Promise<TicketingConnectionRow> {
    const row = connectionId
      ? await prisma.ticketingConnection.findFirst({ where: { id: connectionId, customerId } })
      : (await prisma.ticketingConnection.findFirst({ where: { customerId, isDefault: true, isEnabled: true } })) ??
        (await prisma.ticketingConnection.findFirst({ where: { customerId, isEnabled: true } }))
    if (!row) throw new Error('No ticketing connection configured. Configure one in Settings → Ticketing.')
    if (!row.isEnabled) throw new Error('The selected ticketing connection is disabled.')
    return row
  },
}

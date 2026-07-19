// ========================================================================
// Sandbox Service
//
// Tenant-scoped CRUD + quota enforcement + TTL expiry processing for
// developer sandboxes. File ingest/diff logic lives in sync.service.ts.
// ========================================================================

import * as fs from 'fs'
import { SandboxStatus, type Sandbox } from '@prisma/client'
import prisma from '../../db'
import { loggerService } from '../logger/logger.service'
import { getSandboxConfig, getSandboxDir, computeExpiresAt } from './sandbox.config'
import { SLUG_REGEX, MAX_NAME_LENGTH, type CreateSandboxRequest } from './sandbox.schemas'
import { writeSandboxAudit } from './sandbox.audit'
import { sandboxEvents } from './sandbox.events'
import { sandboxRegistry } from './sandbox-registry'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown for request-level failures the controller maps to 4xx responses. */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'SandboxError'
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function removeSandboxFiles(customerId: string, sandboxId: string): void {
  const dir = getSandboxDir(customerId, sandboxId)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (error) {
    // Never fail the operation because of file cleanup; the TTL job retries.
    loggerService.warn(`Failed to remove sandbox directory ${dir} (non-fatal):`, error)
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const sandboxService = {
  /**
   * Create a sandbox for a tenant, enforcing the per-tenant quota and
   * unique-name constraint. `actorUserId` is null for API-key (CLI) callers.
   */
  async createSandbox(
    customerId: string,
    data: CreateSandboxRequest,
    actorUserId: string | null,
  ): Promise<Sandbox> {
    // Strict slug validation, mirroring the route JSON schema so service
    // callers (jobs, future internal APIs) get identical rules.
    const { quota } = getSandboxConfig()
    const name = data.name?.trim()
    const appId = data.appId?.trim()

    if (!name || name.length > MAX_NAME_LENGTH || !SLUG_REGEX.test(name)) {
      throw new SandboxError(
        `Invalid sandbox name "${data.name}": use lowercase alphanumeric and hyphens (max ${MAX_NAME_LENGTH} chars)`,
        400,
      )
    }
    if (!appId || appId.length > MAX_NAME_LENGTH || !SLUG_REGEX.test(appId)) {
      throw new SandboxError(
        `Invalid app ID "${data.appId}": use lowercase alphanumeric and hyphens (max ${MAX_NAME_LENGTH} chars)`,
        400,
      )
    }

    // Quota counts everything that still occupies a slot (EXPIRED sandboxes
    // have had their files removed and do not count against the quota).
    const activeCount = await prisma.sandbox.count({
      where: { customerId, status: { not: SandboxStatus.EXPIRED } },
    })
    if (activeCount >= quota) {
      throw new SandboxError(
        `Sandbox quota reached (${activeCount}/${quota}). Delete an existing sandbox or contact support to raise the limit.`,
        409,
      )
    }

    const duplicate = await prisma.sandbox.findFirst({ where: { customerId, name } })
    if (duplicate) {
      throw new SandboxError(`A sandbox named "${name}" already exists`, 409)
    }

    const sandbox = await prisma.sandbox.create({
      data: {
        customerId,
        name,
        appId,
        status: SandboxStatus.ACTIVE,
        createdById: actorUserId,
        expiresAt: computeExpiresAt(),
      },
    })

    // Pre-create the storage directory so the first sync never races mkdir.
    try {
      fs.mkdirSync(getSandboxDir(customerId, sandbox.id), { recursive: true })
    } catch (error) {
      loggerService.warn('Failed to pre-create sandbox directory (created lazily on sync):', error)
    }

    loggerService.info(`Sandbox created: ${name} (${sandbox.id}) for customer ${customerId}`)

    await writeSandboxAudit({
      action: 'sandbox.create',
      actorUserId,
      createdById: sandbox.createdById,
      customerId,
      sandboxId: sandbox.id,
      details: { name, appId, expiresAt: sandbox.expiresAt.toISOString() },
    })

    sandboxEvents.emitStatus(customerId, {
      sandboxId: sandbox.id,
      name: sandbox.name,
      status: 'ACTIVE',
      message: 'Sandbox created',
    })

    return sandbox
  },

  /** List all sandboxes for a tenant, newest first. */
  async listSandboxes(customerId: string): Promise<Sandbox[]> {
    return prisma.sandbox.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** Fetch a sandbox, scoped to the tenant. Throws 404 when absent. */
  async getSandbox(id: string, customerId: string): Promise<Sandbox> {
    const sandbox = await prisma.sandbox.findFirst({ where: { id, customerId } })
    if (!sandbox) {
      throw new SandboxError('Sandbox not found', 404)
    }
    return sandbox
  },

  /** Delete a sandbox record and its files. */
  async deleteSandbox(id: string, customerId: string, actorUserId: string | null): Promise<void> {
    const sandbox = await this.getSandbox(id, customerId)

    sandboxRegistry.remove(customerId, sandbox.id)
    removeSandboxFiles(customerId, sandbox.id)
    await prisma.sandbox.delete({ where: { id: sandbox.id } })

    loggerService.info(`Sandbox deleted: ${sandbox.name} (${sandbox.id}) for customer ${customerId}`)

    await writeSandboxAudit({
      action: 'sandbox.delete',
      actorUserId,
      createdById: sandbox.createdById,
      customerId,
      sandboxId: sandbox.id,
      details: { name: sandbox.name, appId: sandbox.appId },
    })
  },

  /**
   * TTL cleanup: mark every past-expiry sandbox EXPIRED and delete its
   * files. Invoked by the repeatable BullMQ job. Returns how many
   * sandboxes were expired.
   */
  async processExpiredSandboxes(now: Date = new Date()): Promise<number> {
    const expired = await prisma.sandbox.findMany({
      where: {
        expiresAt: { lte: now },
        status: { not: SandboxStatus.EXPIRED },
      },
    })

    for (const sandbox of expired) {
      sandboxRegistry.remove(sandbox.customerId, sandbox.id)
      removeSandboxFiles(sandbox.customerId, sandbox.id)

      await prisma.sandbox.update({
        where: { id: sandbox.id },
        data: { status: SandboxStatus.EXPIRED, fileCount: 0, sizeBytes: 0 },
      })

      loggerService.info(
        `Sandbox expired: ${sandbox.name} (${sandbox.id}) for customer ${sandbox.customerId}`,
      )

      await writeSandboxAudit({
        action: 'sandbox.expire',
        actorUserId: null,
        createdById: sandbox.createdById,
        customerId: sandbox.customerId,
        sandboxId: sandbox.id,
        details: { name: sandbox.name, appId: sandbox.appId, expiredAt: now.toISOString() },
      })

      sandboxEvents.emitStatus(sandbox.customerId, {
        sandboxId: sandbox.id,
        name: sandbox.name,
        status: 'EXPIRED',
        message: 'Sandbox expired after its TTL elapsed; files were removed',
      })
    }

    return expired.length
  },
}

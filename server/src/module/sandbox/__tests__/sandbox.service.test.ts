// ========================================================================
// Sandbox Service Tests
//
// Covers: quota enforcement, name/appId validation, duplicate names,
// TTL expiry selection + processing.
//
// NOTE (Community Edition adaptation): the source (private, multi-tenant)
// module wrote audit rows to `PlatformAuditLog` via `prisma.platformAuditLog`
// — a hosted-platform-only table that master-plan §2.4 excludes from this
// schema. sandbox.audit.ts here instead calls `recordAuditEvent`
// (lib/audit-event.ts) against the Community `AuditEvent` model, the same
// helper every other module uses. See sandbox.audit.ts's docblock for the
// full rationale, including why a no-actor (API-key/system) action is now
// recorded with `userId: null` rather than skipped.
// ========================================================================

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import prisma from '../../../db'
import { recordAuditEvent } from '../../../lib/audit-event'
import { sandboxService, SandboxError } from '../sandbox.service'
import { getSandboxDir } from '../sandbox.config'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    sandbox: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('../../../lib/audit-event', () => ({
  recordAuditEvent: jest.fn(),
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const mockPrisma = prisma as unknown as {
  sandbox: {
    count: jest.Mock
    findFirst: jest.Mock
    findMany: jest.Mock
    create: jest.Mock
    update: jest.Mock
    delete: jest.Mock
  }
}
const mockRecordAuditEvent = recordAuditEvent as jest.Mock

const CUSTOMER_ID = '11111111-1111-4111-a111-111111111111'
const USER_ID = '22222222-2222-4222-a222-222222222222'

function makeSandboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-a333-333333333333',
    customerId: CUSTOMER_ID,
    name: 'crowdstrike-dev',
    appId: 'crowdstrike-edr',
    status: 'ACTIVE',
    createdById: USER_ID,
    lastSyncAt: null,
    fileCount: 0,
    sizeBytes: 0,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('sandboxService', () => {
  let tmpRoot: string

  beforeEach(() => {
    jest.clearAllMocks()
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'veltrix-sandbox-test-'))
    process.env.SANDBOX_DIR = tmpRoot
    delete process.env.SANDBOX_QUOTA
    delete process.env.SANDBOX_TTL_DAYS
  })

  afterEach(() => {
    delete process.env.SANDBOX_DIR
    delete process.env.SANDBOX_QUOTA
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------
  // Quota enforcement
  // -------------------------------------------------------------------

  describe('createSandbox quota enforcement', () => {
    it('rejects creation when the tenant is at the default quota (2)', async () => {
      mockPrisma.sandbox.count.mockResolvedValue(2)

      await expect(
        sandboxService.createSandbox(
          CUSTOMER_ID,
          { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
          USER_ID,
        ),
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('quota') })

      expect(mockPrisma.sandbox.create).not.toHaveBeenCalled()
    })

    it('respects the SANDBOX_QUOTA env override', async () => {
      process.env.SANDBOX_QUOTA = '5'
      mockPrisma.sandbox.count.mockResolvedValue(4)
      mockPrisma.sandbox.findFirst.mockResolvedValue(null)
      mockPrisma.sandbox.create.mockResolvedValue(makeSandboxRow())

      const result = await sandboxService.createSandbox(
        CUSTOMER_ID,
        { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
        USER_ID,
      )

      expect(result.name).toBe('crowdstrike-dev')
      expect(mockPrisma.sandbox.create).toHaveBeenCalled()
    })

    it('does not count EXPIRED sandboxes against the quota', async () => {
      mockPrisma.sandbox.count.mockResolvedValue(1)
      mockPrisma.sandbox.findFirst.mockResolvedValue(null)
      mockPrisma.sandbox.create.mockResolvedValue(makeSandboxRow())

      await sandboxService.createSandbox(
        CUSTOMER_ID,
        { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
        USER_ID,
      )

      expect(mockPrisma.sandbox.count).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID, status: { not: 'EXPIRED' } },
      })
    })
  })

  // -------------------------------------------------------------------
  // Creation validation
  // -------------------------------------------------------------------

  describe('createSandbox validation', () => {
    beforeEach(() => {
      mockPrisma.sandbox.count.mockResolvedValue(0)
      mockPrisma.sandbox.findFirst.mockResolvedValue(null)
    })

    it('rejects invalid sandbox names', async () => {
      for (const badName of ['UPPER', 'has space', '-leading', 'trailing-', 'a'.repeat(70), '']) {
        await expect(
          sandboxService.createSandbox(CUSTOMER_ID, { name: badName, appId: 'my-app' }, USER_ID),
        ).rejects.toBeInstanceOf(SandboxError)
      }
      expect(mockPrisma.sandbox.create).not.toHaveBeenCalled()
    })

    it('rejects invalid app IDs', async () => {
      await expect(
        sandboxService.createSandbox(CUSTOMER_ID, { name: 'ok-name', appId: '../etc' }, USER_ID),
      ).rejects.toMatchObject({ statusCode: 400 })
    })

    it('rejects duplicate names within the tenant', async () => {
      mockPrisma.sandbox.findFirst.mockResolvedValue(makeSandboxRow())

      await expect(
        sandboxService.createSandbox(
          CUSTOMER_ID,
          { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
          USER_ID,
        ),
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('already exists') })
    })

    it('creates with a TTL-based expiry and records an AuditEvent', async () => {
      const before = Date.now()
      mockPrisma.sandbox.create.mockImplementation(async ({ data }: { data: any }) =>
        makeSandboxRow({ ...data, id: '33333333-3333-4333-a333-333333333333' }),
      )

      await sandboxService.createSandbox(
        CUSTOMER_ID,
        { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
        USER_ID,
      )

      const createArg = mockPrisma.sandbox.create.mock.calls[0][0].data
      const expectedTtlMs = 7 * 24 * 60 * 60 * 1000
      expect(createArg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedTtlMs - 5000)
      expect(createArg.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + expectedTtlMs + 5000)

      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          userId: USER_ID,
          action: 'sandbox.create',
          resourceType: 'sandbox',
        }),
      )
    })

    it('records an AuditEvent with userId: null when there is no user actor (API-key/system actor)', async () => {
      mockPrisma.sandbox.create.mockResolvedValue(makeSandboxRow({ createdById: null }))

      await sandboxService.createSandbox(
        CUSTOMER_ID,
        { name: 'crowdstrike-dev', appId: 'crowdstrike-edr' },
        null, // API-key (CLI) caller
      )

      // AuditEvent.userId is nullable (unlike the source's PlatformAuditLog,
      // whose required adminUserId FK forced a structured-log-only fallback
      // for actor-less actions) — so the action is still recorded, with
      // userId: null identifying it as a system/API-key actor.
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          userId: null,
          action: 'sandbox.create',
        }),
      )
    })
  })

  // -------------------------------------------------------------------
  // Get / delete tenancy scoping
  // -------------------------------------------------------------------

  describe('tenancy scoping', () => {
    it('getSandbox scopes lookups by customerId and 404s when absent', async () => {
      mockPrisma.sandbox.findFirst.mockResolvedValue(null)

      await expect(sandboxService.getSandbox('some-id', CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 404,
      })
      expect(mockPrisma.sandbox.findFirst).toHaveBeenCalledWith({
        where: { id: 'some-id', customerId: CUSTOMER_ID },
      })
    })

    it('deleteSandbox removes the record and the sandbox directory', async () => {
      const row = makeSandboxRow()
      mockPrisma.sandbox.findFirst.mockResolvedValue(row)
      mockPrisma.sandbox.delete.mockResolvedValue(row)

      const dir = getSandboxDir(CUSTOMER_ID, row.id)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'manifest.yaml'), 'id: x')

      await sandboxService.deleteSandbox(row.id, CUSTOMER_ID, USER_ID)

      expect(fs.existsSync(dir)).toBe(false)
      expect(mockPrisma.sandbox.delete).toHaveBeenCalledWith({ where: { id: row.id } })
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sandbox.delete' }),
      )
    })
  })

  // -------------------------------------------------------------------
  // TTL expiry selection + processing
  // -------------------------------------------------------------------

  describe('processExpiredSandboxes', () => {
    it('selects only past-expiry, not-yet-EXPIRED sandboxes', async () => {
      mockPrisma.sandbox.findMany.mockResolvedValue([])

      const now = new Date('2026-07-10T12:00:00Z')
      await sandboxService.processExpiredSandboxes(now)

      expect(mockPrisma.sandbox.findMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lte: now },
          status: { not: 'EXPIRED' },
        },
      })
    })

    it('marks expired sandboxes EXPIRED, zeroes counters and removes files', async () => {
      const expired = makeSandboxRow({
        id: '44444444-4444-4444-a444-444444444444',
        expiresAt: new Date('2026-07-01T00:00:00Z'),
      })
      mockPrisma.sandbox.findMany.mockResolvedValue([expired])
      mockPrisma.sandbox.update.mockResolvedValue({ ...expired, status: 'EXPIRED' })

      const dir = getSandboxDir(CUSTOMER_ID, expired.id)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'index.ts'), 'export {}')

      const count = await sandboxService.processExpiredSandboxes(new Date('2026-07-10T12:00:00Z'))

      expect(count).toBe(1)
      expect(fs.existsSync(dir)).toBe(false)
      expect(mockPrisma.sandbox.update).toHaveBeenCalledWith({
        where: { id: expired.id },
        data: { status: 'EXPIRED', fileCount: 0, sizeBytes: 0 },
      })
      expect(mockRecordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sandbox.expire' }),
      )
    })

    it('returns 0 and touches nothing when nothing is expired', async () => {
      mockPrisma.sandbox.findMany.mockResolvedValue([])

      const count = await sandboxService.processExpiredSandboxes()

      expect(count).toBe(0)
      expect(mockPrisma.sandbox.update).not.toHaveBeenCalled()
    })
  })
})

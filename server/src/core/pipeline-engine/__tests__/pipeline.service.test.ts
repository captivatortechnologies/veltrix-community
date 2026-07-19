// resolvePermissionSnapshotForUser (lib/permissions.ts) reads the singleton
// `prisma` from ../../db directly — separate from the PrismaClient instance
// injected into PipelineService's constructor (this.db) used everywhere
// else in this file. Both point at the same real DB in production; in
// tests they must be mocked independently.
jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

import { PipelineService } from '../pipeline.service'
import singletonPrisma from '../../../db'

type Mocks = Record<string, jest.Mock>

function makeDb() {
  const db = {
    environmentPolicy: { findUnique: jest.fn(), findFirst: jest.fn() },
  }
  return db as unknown as { environmentPolicy: Mocks }
}

function makeService(db: ReturnType<typeof makeDb>) {
  // getHandlers / enqueueJob are unused by the method under test.
  return new PipelineService(
    db as any,
    () => null,
    async () => undefined,
  )
}

const CUSTOMER = 'cust-1'

const canvas = {
  customerId: CUSTOMER,
  toolType: 'crowdstrike-edr',
  tags: [{ tagId: 'env-prod' }],
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PipelineService.getEnvironmentPolicy (approval gate)', () => {
  it('returns null when the canvas has no environment tag', async () => {
    const db = makeDb()
    const svc = makeService(db)

    const result = await (svc as any).getEnvironmentPolicy({ ...canvas, tags: [] })

    expect(result).toBeNull()
    expect(db.environmentPolicy.findUnique).not.toHaveBeenCalled()
    expect(db.environmentPolicy.findFirst).not.toHaveBeenCalled()
  })

  it('returns the app-specific policy when one exists', async () => {
    const db = makeDb()
    const appPolicy = { id: 'pol-app', appId: 'crowdstrike-edr', requireApproval: false }
    db.environmentPolicy.findUnique.mockResolvedValue(appPolicy)
    const svc = makeService(db)

    const result = await (svc as any).getEnvironmentPolicy(canvas)

    expect(db.environmentPolicy.findUnique).toHaveBeenCalledWith({
      where: {
        tagId_customerId_appId: { tagId: 'env-prod', customerId: CUSTOMER, appId: 'crowdstrike-edr' },
      },
    })
    expect(result).toBe(appPolicy)
    // No need to consult the global policy when an app-specific one exists.
    expect(db.environmentPolicy.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the global policy (appId "") when no app-specific policy exists', async () => {
    const db = makeDb()
    const globalPolicy = { id: 'pol-global', appId: '', requireApproval: false }
    db.environmentPolicy.findUnique.mockResolvedValue(null)
    db.environmentPolicy.findFirst.mockResolvedValue(globalPolicy)
    const svc = makeService(db)

    const result = await (svc as any).getEnvironmentPolicy(canvas)

    expect(db.environmentPolicy.findFirst).toHaveBeenCalledWith({
      where: { tagId: 'env-prod', customerId: CUSTOMER, appId: '' },
    })
    expect(result).toBe(globalPolicy)
  })
})

// ---------------------------------------------------------------------------
// R3 (RBAC/IdP hardening 2026-07-10): PipelineContext.permissions is
// populated for the triggering user at every context builder — this one
// backs `validate()`.
// ---------------------------------------------------------------------------

describe('PipelineService.buildPipelineContext — permissions snapshot (R3)', () => {
  const mockUserFindUnique = singletonPrisma.user.findUnique as jest.Mock
  const mockQueryRaw = singletonPrisma.$queryRaw as jest.Mock

  it('resolves and attaches the triggering user\'s permission snapshot', async () => {
    const db = makeDb()
    const svc = makeService(db)

    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'role-1',
      isPlatformAdmin: false,
      role: { name: 'User' },
    })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: 'role-1', appId: 'crowdstrike-edr' },
    ])

    const ctx = await (svc as any).buildPipelineContext(
      canvas,
      { id: 's1' },
      { id: 'env-1', name: 'prod' },
      { id: 'user-1', email: 'u@tenant.test', name: 'User One' },
    )

    expect(ctx.permissions).toEqual({
      permissions: [{ resource: 'indexes', action: 'read', appId: 'crowdstrike-edr' }],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: false,
    })
  })

  it('short-circuits to an allAll snapshot for a platform-admin triggering user', async () => {
    const db = makeDb()
    const svc = makeService(db)

    mockUserFindUnique.mockResolvedValue({
      id: 'admin-1',
      roleId: 'role-admin',
      isPlatformAdmin: true,
      role: { name: 'Administrator' },
    })

    const ctx = await (svc as any).buildPipelineContext(
      canvas,
      { id: 's1' },
      { id: 'env-1', name: 'prod' },
      { id: 'admin-1', email: 'admin@tenant.test', name: 'Admin' },
    )

    expect(ctx.permissions.isPlatformAdmin).toBe(true)
    expect(ctx.permissions.wildcards.allAll).toBe(true)
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })
})

// resolvePermissionSnapshotForUser (lib/permissions.ts) reads the singleton
// `prisma` from ../../db directly — separate from the PrismaClient instance
// injected into DeploymentOrchestrator's constructor (this.db). Both point
// at the same real DB in production; in tests they're mocked independently.
jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

import { DeploymentOrchestrator } from '../deployment.orchestrator'
import { loggerService } from '../../../module/logger/logger.service'
import singletonPrisma from '../../../db'

// The orchestrator dynamically imports the logger inside getTargetComponents;
// mock it so the unresolved-app branch doesn't touch the real logging stack.
jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

type Mocks = Record<string, jest.Mock>

function makeDb() {
  const db = {
    app: { findUnique: jest.fn() },
    appConfigurationType: { findFirst: jest.fn() },
    component: { findMany: jest.fn(), findUnique: jest.fn() },
    environmentPolicy: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findUniqueOrThrow: jest.fn() },
    tag: { findUniqueOrThrow: jest.fn() },
    componentConnectivity: { findUnique: jest.fn() },
    credential: { findUnique: jest.fn(), findFirst: jest.fn() },
    connectivityProvider: { findFirst: jest.fn() },
  }
  return db as unknown as {
    app: Mocks
    appConfigurationType: Mocks
    component: Mocks
    environmentPolicy: Mocks
    user: Mocks
    tag: Mocks
    componentConnectivity: Mocks
    credential: Mocks
    connectivityProvider: Mocks
  }
}

function makeOrchestrator(db: ReturnType<typeof makeDb>) {
  // getHandlers / enqueueJob are unused by the methods under test.
  return new DeploymentOrchestrator(
    db as any,
    () => null,
    async () => undefined,
  )
}

const CUSTOMER = 'cust-1'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DeploymentOrchestrator.getTargetComponents', () => {
  it('resolves the app by slug and filters components by the config type componentTypes', async () => {
    const db = makeDb()
    // data.appId is the SLUG; App.appId is the slug, App.id is the UUID.
    db.app.findUnique.mockResolvedValue({ id: 'app-uuid-123', appId: 'crowdstrike-edr' })
    db.appConfigurationType.findFirst.mockResolvedValue({
      id: 'cfg-1',
      appId: 'app-uuid-123',
      configTypeId: 'host-groups',
      componentTypes: ['falcon-tenant'],
    })
    db.component.findMany.mockResolvedValue([
      { id: 'c1', hostname: 'tenant-a', port: '443', type: ['falcon-tenant'], toolId: 'tool-1' },
    ])

    const orch = makeOrchestrator(db)
    const result = await (orch as any).getTargetComponents({
      customerId: CUSTOMER,
      appId: 'crowdstrike-edr',
      configTypeId: 'host-groups',
    })

    // App resolved by slug, config type looked up by the resulting UUID.
    expect(db.app.findUnique).toHaveBeenCalledWith({ where: { appId: 'crowdstrike-edr' } })
    expect(db.appConfigurationType.findFirst).toHaveBeenCalledWith({
      where: { appId: 'app-uuid-123', configTypeId: 'host-groups' },
    })
    // Only components whose type intersects componentTypes are targeted.
    expect(db.component.findMany).toHaveBeenCalledWith({
      where: { customerId: CUSTOMER, type: { hasSome: ['falcon-tenant'] } },
    })
    expect(loggerService.warn).not.toHaveBeenCalled()
    expect(result).toEqual([
      { id: 'c1', hostname: 'tenant-a', port: '443', type: ['falcon-tenant'], toolId: 'tool-1' },
    ])
  })

  it('falls back to targeting all components (no type filter) and warns when the app cannot be resolved', async () => {
    const db = makeDb()
    db.app.findUnique.mockResolvedValue(null) // slug not found -> no config type
    db.component.findMany.mockResolvedValue([
      { id: 'c1', hostname: 'h1', port: '22', type: ['server'], toolId: 't1' },
      { id: 'c2', hostname: 'h2', port: '443', type: ['falcon-tenant'], toolId: 't2' },
    ])

    const orch = makeOrchestrator(db)
    const result = await (orch as any).getTargetComponents({
      customerId: CUSTOMER,
      appId: 'unknown-app',
      configTypeId: 'host-groups',
    })

    // No config type resolved -> the type filter is omitted (all components).
    expect(db.appConfigurationType.findFirst).not.toHaveBeenCalled()
    expect(db.component.findMany).toHaveBeenCalledWith({ where: { customerId: CUSTOMER } })
    expect(loggerService.warn).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })
})

describe('DeploymentOrchestrator.getPolicy', () => {
  it('returns the app-specific policy when one exists', async () => {
    const db = makeDb()
    const appPolicy = { id: 'pol-app', appId: 'crowdstrike-edr', canarySteps: [20, 100] }
    db.environmentPolicy.findUnique.mockResolvedValue(appPolicy)

    const orch = makeOrchestrator(db)
    const result = await (orch as any).getPolicy('env-prod', CUSTOMER, 'crowdstrike-edr')

    expect(result).toBe(appPolicy)
    expect(db.environmentPolicy.findFirst).not.toHaveBeenCalled()
  })

  it('falls back to the global policy (appId "") when no app-specific policy exists', async () => {
    const db = makeDb()
    const globalPolicy = { id: 'pol-global', appId: '', autoRollbackOnError: true, canarySteps: [10, 50, 100] }
    db.environmentPolicy.findUnique.mockResolvedValue(null)
    db.environmentPolicy.findFirst.mockResolvedValue(globalPolicy)

    const orch = makeOrchestrator(db)
    const result = await (orch as any).getPolicy('env-prod', CUSTOMER, 'crowdstrike-edr')

    expect(db.environmentPolicy.findFirst).toHaveBeenCalledWith({
      where: { tagId: 'env-prod', customerId: CUSTOMER, appId: '' },
    })
    expect(result).toBe(globalPolicy)
  })
})

// ---------------------------------------------------------------------------
// R3 (RBAC/IdP hardening 2026-07-10): PipelineContext.permissions is
// populated for the triggering user at every deploy/rollback/health-check
// context builder.
// ---------------------------------------------------------------------------

describe('DeploymentOrchestrator.buildRollbackContext — permissions snapshot (R3)', () => {
  const mockUserFindUnique = singletonPrisma.user.findUnique as jest.Mock
  const mockQueryRaw = singletonPrisma.$queryRaw as jest.Mock

  const component = { id: 'comp-1', hostname: 'h1', port: '443', type: ['tenant'], toolId: 'tool-1' }

  function stubComponentAccess(db: ReturnType<typeof makeDb>) {
    db.componentConnectivity.findUnique.mockResolvedValue(null)
    db.component.findUnique.mockResolvedValue({ ...component, credentialId: null, customerId: CUSTOMER })
    db.credential.findFirst.mockResolvedValue(null)
    db.connectivityProvider.findFirst.mockResolvedValue(null)
  }

  it("resolves and attaches the triggering user's permission snapshot", async () => {
    const db = makeDb()
    stubComponentAccess(db)
    db.tag.findUniqueOrThrow.mockResolvedValue({ id: 'env-1', name: 'prod' })
    db.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', email: 'u@tenant.test', name: 'User One' })

    mockUserFindUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'role-1',
      isPlatformAdmin: false,
      role: { name: 'User' },
    })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'all', action: 'all', roleId: 'role-1', appId: null },
    ])

    const orch = makeOrchestrator(db)
    const ctx = await (orch as any).buildRollbackContext(
      { appId: 'crowdstrike-edr', customerId: CUSTOMER, environmentId: 'env-1', triggeredById: 'user-1' },
      component,
      { id: 'snap-1' },
      { some: 'rollback-data' },
    )

    expect(ctx.permissions.wildcards.allAll).toBe(true)
    expect(mockUserFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }))
  })

  it('resolves a non-admin snapshot scoped to the real permission rows', async () => {
    const db = makeDb()
    stubComponentAccess(db)
    db.tag.findUniqueOrThrow.mockResolvedValue({ id: 'env-1', name: 'prod' })
    db.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-2', email: 'u2@tenant.test', name: 'User Two' })

    mockUserFindUnique.mockResolvedValue({
      id: 'user-2',
      roleId: 'role-2',
      isPlatformAdmin: false,
      role: { name: 'Deployer' },
    })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'write', roleId: 'role-2', appId: 'crowdstrike-edr' },
    ])

    const orch = makeOrchestrator(db)
    const ctx = await (orch as any).buildRollbackContext(
      { appId: 'crowdstrike-edr', customerId: CUSTOMER, environmentId: 'env-1', triggeredById: 'user-2' },
      component,
      { id: 'snap-1' },
      null,
    )

    expect(ctx.permissions).toEqual({
      permissions: [{ resource: 'indexes', action: 'write', appId: 'crowdstrike-edr' }],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: false,
    })
  })
})

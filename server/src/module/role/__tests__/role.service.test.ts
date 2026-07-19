// ========================================================================
// Tests: role.service — CRUD + the privilege-escalation guard (R0, RBAC/IdP
// hardening 2026-07-10). The escalation guard is the fix for the live hole
// where any authenticated user could PUT /roles/:id and grant themselves
// (or any role) `all:all`.
// ========================================================================

import { roleService, RoleEscalationError } from '../role.service'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockRoleFindFirst = prisma.role.findFirst as jest.Mock
const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockRoleCreate = prisma.role.create as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock

const ACTOR_ROLE_ID = 'actor-role-1'
const TARGET_ROLE_ID = 'target-role-1'
const CUSTOMER_ID = 'cust-1'

beforeEach(() => jest.clearAllMocks())

describe('roleService.createRole — escalation guard', () => {
  it('blocks a non-admin actor from granting all:all to a new role', async () => {
    mockRoleFindFirst.mockResolvedValueOnce(null) // no name conflict
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'role', action: 'write', roleId: ACTOR_ROLE_ID, appId: null }])

    await expect(
      roleService.createRole(
        {
          name: 'New Admin',
          customerId: CUSTOMER_ID,
          permissions: [{ resource: 'all', action: 'all' }],
        },
        ACTOR_ROLE_ID,
      ),
    ).rejects.toBeInstanceOf(RoleEscalationError)

    expect(mockRoleCreate).not.toHaveBeenCalled()
  })

  it('allows granting a permission the actor already holds', async () => {
    mockRoleFindFirst.mockResolvedValueOnce(null)
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'role', action: 'write', roleId: ACTOR_ROLE_ID, appId: null },
      { id: 'p2', resource: 'tool', action: 'read', roleId: ACTOR_ROLE_ID, appId: null },
    ])
    mockRoleCreate.mockResolvedValue({ id: TARGET_ROLE_ID, name: 'New Role', customerId: CUSTOMER_ID, permissions: [] })

    await expect(
      roleService.createRole(
        { name: 'New Role', customerId: CUSTOMER_ID, permissions: [{ resource: 'tool', action: 'read' }] },
        ACTOR_ROLE_ID,
      ),
    ).resolves.toBeDefined()

    expect(mockRoleCreate).toHaveBeenCalled()
  })

  it('allows an unrestricted admin (all:all) to grant any permission', async () => {
    mockRoleFindFirst.mockResolvedValueOnce(null)
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: ACTOR_ROLE_ID, appId: null }])
    mockRoleCreate.mockResolvedValue({ id: TARGET_ROLE_ID, name: 'New Admin', customerId: CUSTOMER_ID, permissions: [] })

    await expect(
      roleService.createRole(
        { name: 'New Admin', customerId: CUSTOMER_ID, permissions: [{ resource: 'all', action: 'all' }] },
        ACTOR_ROLE_ID,
      ),
    ).resolves.toBeDefined()
  })

  it('skips the guard entirely when no actorRoleId is supplied (internal/legacy callers)', async () => {
    mockRoleFindFirst.mockResolvedValueOnce(null)
    mockRoleCreate.mockResolvedValue({ id: TARGET_ROLE_ID, name: 'New Admin', customerId: CUSTOMER_ID, permissions: [] })

    await expect(
      roleService.createRole({
        name: 'New Admin',
        customerId: CUSTOMER_ID,
        permissions: [{ resource: 'all', action: 'all' }],
      }),
    ).resolves.toBeDefined()
    expect(mockRoleFindUnique).not.toHaveBeenCalled()
  })
})

describe('roleService.updateRole — escalation guard', () => {
  function mockTransactionPassthrough() {
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        role: {
          update: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID, name: 'Target', customerId: CUSTOMER_ID }),
          findUnique: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID, name: 'Target', customerId: CUSTOMER_ID, permissions: [] }),
        },
        permission: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    )
  }

  it('blocks self-escalation: an actor without all:all cannot grant all:all to their OWN role', async () => {
    // Actor is editing their own role (actorRoleId === roleId).
    mockRoleFindFirst.mockResolvedValueOnce({ id: ACTOR_ROLE_ID, name: 'RoleManager', customerId: CUSTOMER_ID })
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'role', action: 'write', roleId: ACTOR_ROLE_ID, appId: null }])

    await expect(
      roleService.updateRole(
        ACTOR_ROLE_ID,
        CUSTOMER_ID,
        { permissions: [{ resource: 'all', action: 'all' }] },
        ACTOR_ROLE_ID,
      ),
    ).rejects.toBeInstanceOf(RoleEscalationError)

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('blocks escalation when granting a DIFFERENT role a permission the actor lacks', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Other', customerId: CUSTOMER_ID })
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'role', action: 'write', roleId: ACTOR_ROLE_ID, appId: null }])

    await expect(
      roleService.updateRole(
        TARGET_ROLE_ID,
        CUSTOMER_ID,
        { permissions: [{ resource: 'credential', action: 'write' }] },
        ACTOR_ROLE_ID,
      ),
    ).rejects.toBeInstanceOf(RoleEscalationError)
  })

  it('allows an unrestricted admin to update any role, including granting all:all', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Other', customerId: CUSTOMER_ID })
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: ACTOR_ROLE_ID, appId: null }])
    mockTransactionPassthrough()

    await expect(
      roleService.updateRole(
        TARGET_ROLE_ID,
        CUSTOMER_ID,
        { permissions: [{ resource: 'all', action: 'all' }] },
        ACTOR_ROLE_ID,
      ),
    ).resolves.toBeDefined()
    expect(mockTransaction).toHaveBeenCalled()
  })

  it('allows non-permission edits (name/description) without consulting the guard at all', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Other', customerId: CUSTOMER_ID })
    mockTransactionPassthrough()

    await expect(
      roleService.updateRole(TARGET_ROLE_ID, CUSTOMER_ID, { name: 'Renamed' }, ACTOR_ROLE_ID),
    ).resolves.toBeDefined()
    // No permissions array in the payload -> guard short-circuits, no role/permission lookup needed.
    expect(mockRoleFindUnique).not.toHaveBeenCalled()
    expect(mockQueryRaw).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// R5 (RBAC/IdP hardening 2026-07-10): role.service reads/writes appId.
// ---------------------------------------------------------------------------

describe('roleService — appId read/write (R5)', () => {
  const APP_ID = 'app-uuid-splunk'

  it('createRole writes appId through for an app-scoped permission, and null for an omitted one', async () => {
    mockRoleFindFirst.mockResolvedValueOnce(null) // no name conflict
    mockRoleCreate.mockResolvedValue({ id: TARGET_ROLE_ID, name: 'Mixed', customerId: CUSTOMER_ID, permissions: [] })

    await roleService.createRole({
      name: 'Mixed',
      customerId: CUSTOMER_ID,
      permissions: [
        { resource: 'indexes', action: 'read', appId: APP_ID },
        { resource: 'tool', action: 'read' }, // no appId -> platform-scoped
      ],
    })

    expect(mockRoleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          permissions: {
            create: [
              { resource: 'indexes', action: 'read', appId: APP_ID },
              { resource: 'tool', action: 'read', appId: null },
            ],
          },
        }),
      }),
    )
  })

  it('updateRole writes appId through createMany for each permission', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Target', customerId: CUSTOMER_ID })

    const createMany = jest.fn().mockResolvedValue({ count: 2 })
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 })
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        role: {
          update: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID }),
          findUnique: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID, permissions: [] }),
        },
        permission: { deleteMany, createMany },
      }),
    )

    await roleService.updateRole(TARGET_ROLE_ID, CUSTOMER_ID, {
      permissions: [
        { resource: 'roles', action: 'write', appId: APP_ID },
        { resource: 'credential', action: 'read', appId: null },
      ],
    })

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { resource: 'roles', action: 'write', roleId: TARGET_ROLE_ID, appId: APP_ID },
        { resource: 'credential', action: 'read', roleId: TARGET_ROLE_ID, appId: null },
      ],
    })
  })

  it('the escalation guard is appId-aware: holding a platform grant does not let you grant a DIFFERENT app the same resource:action', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Other', customerId: CUSTOMER_ID })
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    // Actor holds an APP-scoped grant for app-A, not app-B.
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: ACTOR_ROLE_ID, appId: 'app-A' },
    ])

    await expect(
      roleService.updateRole(
        TARGET_ROLE_ID,
        CUSTOMER_ID,
        { permissions: [{ resource: 'indexes', action: 'read', appId: 'app-B' }] },
        ACTOR_ROLE_ID,
      ),
    ).rejects.toBeInstanceOf(RoleEscalationError)
  })

  it('the escalation guard allows granting an app-scoped permission covered by the actor\'s platform-scoped grant (decision 2)', async () => {
    mockRoleFindFirst.mockResolvedValueOnce({ id: TARGET_ROLE_ID, name: 'Other', customerId: CUSTOMER_ID })
    mockRoleFindUnique.mockResolvedValue({ id: ACTOR_ROLE_ID, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'indexes', action: 'read', roleId: ACTOR_ROLE_ID, appId: null },
    ])

    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        role: {
          update: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID }),
          findUnique: jest.fn().mockResolvedValue({ id: TARGET_ROLE_ID, permissions: [] }),
        },
        permission: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany },
      }),
    )

    await expect(
      roleService.updateRole(
        TARGET_ROLE_ID,
        CUSTOMER_ID,
        { permissions: [{ resource: 'indexes', action: 'read', appId: APP_ID }] },
        ACTOR_ROLE_ID,
      ),
    ).resolves.toBeDefined()
    expect(createMany).toHaveBeenCalled()
  })
})

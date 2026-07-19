// ========================================================================
// Tests: role.route — R0 (URGENT) fix for the live privilege-escalation
// hole. Exercises the REAL hasPermission middleware and the REAL
// roleService escalation guard end-to-end via fastify.inject, with only
// prisma and verifyToken mocked.
// ========================================================================

import Fastify from 'fastify'
import roleRoutes from '../role.route'
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
    subscription: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// Real hasPermission, mocked verifyToken (bypasses JWT decoding; the
// request.user shape is exactly what verifyToken normally sets).
jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: async (req: any) => {
      req.user = (global as any).__TEST_USER__
      req.headers['x-customer-id'] = (global as any).__TEST_USER__?.customerId
    },
  }
})

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockRoleFindFirst = prisma.role.findFirst as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

const CUSTOMER_ID = 'cust-1'

function setTestUser(user: { id: string; customerId: string; roleId: string }) {
  ;(global as any).__TEST_USER__ = user
  // Role management requires a paid tier (requireTierFeature); default these
  // tests to a paid tenant so the tier gate passes and the escalation guard
  // under test is what's exercised.
  ;(prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ tier: 'enterprise' })
}

describe('role.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(roleRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => jest.clearAllMocks())

  it('403s a user with NO role permission at all on GET /roles', async () => {
    setTestUser({ id: 'u1', customerId: CUSTOMER_ID, roleId: '00000000-0000-0000-0000-0000000000a1' })
    mockRoleFindUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-0000000000a1', name: 'ReadOnlyUser' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'tool', action: 'read', roleId: '00000000-0000-0000-0000-0000000000a1', appId: null }])

    const res = await app.inject({ method: 'GET', url: '/api/roles' })

    expect(res.statusCode).toBe(403)
  })

  it('403s PUT /roles/:id for a user with NO role:write permission (the original hole: was verifyToken-only)', async () => {
    setTestUser({ id: 'u1', customerId: CUSTOMER_ID, roleId: '00000000-0000-0000-0000-0000000000a1' })
    mockRoleFindUnique.mockResolvedValue({ id: '00000000-0000-0000-0000-0000000000a1', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])

    const res = await app.inject({
      method: 'PUT',
      url: '/api/roles/00000000-0000-0000-0000-0000000000b2',
      payload: { permissions: [{ resource: 'all', action: 'all' }] },
    })

    expect(res.statusCode).toBe(403)
  })

  it('escalation-blocked: a non-admin holding role:write cannot PUT their own role to add all:all', async () => {
    const actorRoleId = '00000000-0000-0000-0000-0000000000c3'
    setTestUser({ id: 'u1', customerId: CUSTOMER_ID, roleId: actorRoleId })

    // hasPermission('role','write') check: role-manager holds role:write (not all:all).
    mockRoleFindUnique.mockResolvedValue({ id: actorRoleId, name: 'RoleManager' })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'role', action: 'write', roleId: actorRoleId, appId: null },
    ])
    // roleService.updateRole's existence check: editing their OWN role.
    mockRoleFindFirst.mockResolvedValue({ id: actorRoleId, name: 'RoleManager', customerId: CUSTOMER_ID })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/roles/${actorRoleId}`,
      payload: { permissions: [{ resource: 'all', action: 'all' }] },
    })

    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.error).toContain('Cannot grant permission')
  })

  it('allows an unrestricted admin (all:all) to update another role', async () => {
    const actorRoleId = '00000000-0000-0000-0000-0000000000d4'
    const targetRoleId = '00000000-0000-0000-0000-0000000000b2'
    setTestUser({ id: 'u1', customerId: CUSTOMER_ID, roleId: actorRoleId })

    mockRoleFindUnique.mockResolvedValue({ id: actorRoleId, name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: actorRoleId, appId: null }])
    mockRoleFindFirst.mockResolvedValue({ id: targetRoleId, name: 'Target', customerId: CUSTOMER_ID })
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        role: {
          update: jest.fn().mockResolvedValue({ id: targetRoleId, name: 'Target', customerId: CUSTOMER_ID }),
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: targetRoleId, name: 'Target', customerId: CUSTOMER_ID, permissions: [] }),
        },
        permission: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    )

    const res = await app.inject({
      method: 'PUT',
      url: `/api/roles/${targetRoleId}`,
      payload: { permissions: [{ resource: 'credential', action: 'write' }] },
    })

    expect(res.statusCode).toBe(200)
  })
})

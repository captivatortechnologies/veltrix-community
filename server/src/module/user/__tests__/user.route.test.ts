// ========================================================================
// Tests: user.route — URGENT security fix (2026-07-11).
//
// GET/POST /api/users and DELETE /api/users/:id used to be unauthenticated
// inline routes in server.ts, allowing full account takeover: anyone could
// enumerate users and create a LOCAL user (any password/role) in ANY
// customer, including the platform tenant. This module replaces them with
// verifyToken + hasPermission('user', 'read'|'write'), scoped exclusively
// to request.user.customerId.
// ========================================================================

import Fastify from 'fastify'
import userRoutes from '../user.route'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(),
    user: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    userPassword: { upsert: jest.fn(), delete: jest.fn() },
    userProfile: { deleteMany: jest.fn() },
    userSettings: { deleteMany: jest.fn() },
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../cognito/cognito.service', () => ({
  cognitoService: {
    checkUserExistsInCognito: jest.fn().mockResolvedValue(false),
    createUserInCognito: jest.fn(),
    deleteUserFromCognito: jest.fn().mockResolvedValue({ success: true }),
  },
}))

jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: async (req: any) => {
      req.user = (global as any).__TEST_USER__
      if (req.user) req.headers['x-role-id'] = req.user.roleId
    },
  }
})

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockRoleFindFirst = prisma.role.findFirst as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock
const mockUserFindMany = prisma.user.findMany as jest.Mock
const mockUserFindFirst = prisma.user.findFirst as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserCreate = prisma.user.create as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockUserDelete = prisma.user.delete as jest.Mock

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

const OWN_CUSTOMER = 'cust-1'
const OTHER_CUSTOMER = 'cust-2'
const ADMIN_USER = { id: 'admin-1', customerId: OWN_CUSTOMER, roleId: 'role-admin' }
const NO_PERMS_USER = { id: 'u1', customerId: OWN_CUSTOMER, roleId: 'role-no-perms' }

describe('user.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(userRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])
  })

  it('401s GET /api/users when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({ method: 'GET', url: '/api/users' })
    expect(res.statusCode).toBe(401)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('401s POST /api/users when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { email: 'attacker@evil.com', password: 'password123', roleId: 'role-x' },
    })
    expect(res.statusCode).toBe(401)
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('401s DELETE /api/users/:id when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({ method: 'DELETE', url: '/api/users/00000000-0000-0000-0000-000000000099' })
    expect(res.statusCode).toBe(401)
    expect(mockUserDelete).not.toHaveBeenCalled()
  })

  it('403s GET /api/users for a user without user:read', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({ method: 'GET', url: '/api/users' })
    expect(res.statusCode).toBe(403)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('403s POST /api/users for a user without user:write', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { email: 'newuser@acme.com', password: 'password123', roleId: 'role-x' },
    })
    expect(res.statusCode).toBe(403)
    expect(mockUserCreate).not.toHaveBeenCalled()
  })

  it('403s DELETE /api/users/:id for a user without user:write', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({ method: 'DELETE', url: '/api/users/00000000-0000-0000-0000-000000000099' })
    expect(res.statusCode).toBe(403)
    expect(mockUserDelete).not.toHaveBeenCalled()
  })

  it('allows GET /api/users for an unrestricted admin (all:all) and scopes the query to the caller\'s tenant', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockUserFindMany.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/api/users' })
    expect(res.statusCode).toBe(200)
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: OWN_CUSTOMER }) })
    )
  })

  it('creating a user IGNORES a client-supplied customerId and always uses the caller\'s own tenant', async () => {
    setTestUser(ADMIN_USER)
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'user', action: 'write', roleId: 'role-admin', appId: null }])
    mockRoleFindFirst.mockResolvedValue({ id: 'role-x', name: 'User', customerId: OWN_CUSTOMER })
    mockUserFindUnique.mockResolvedValue(null) // no existing user with this email
    mockUserCreate.mockResolvedValue({
      id: 'new-user-1',
      name: 'New User',
      firstName: null,
      lastName: null,
      phoneNumber: null,
      email: 'newuser@acme.com',
      customerId: OWN_CUSTOMER,
      authProvider: 'LOCAL',
      role: { name: 'User' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: {
        name: 'New User',
        email: 'newuser@acme.com',
        password: 'password123',
        roleId: 'role-x',
        authProvider: 'LOCAL',
        // Attacker-controlled: attempts to plant the user in a DIFFERENT tenant.
        customerId: OTHER_CUSTOMER,
      },
    })

    expect(res.statusCode).toBe(201);
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: OWN_CUSTOMER }),
      })
    )
    // The role lookup was scoped to the caller's own tenant too — a roleId
    // belonging to another customer can never be attached to the new user.
    expect(mockRoleFindFirst).toHaveBeenCalledWith({ where: { id: 'role-x', customerId: OWN_CUSTOMER } })
  })

  it('DELETE /api/users/:id 404s for a user that belongs to a different tenant', async () => {
    setTestUser(ADMIN_USER)
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'user', action: 'write', roleId: 'role-admin', appId: null }])
    mockUserFindFirst.mockResolvedValue(null) // not found scoped to OWN_CUSTOMER

    const res = await app.inject({ method: 'DELETE', url: '/api/users/00000000-0000-0000-0000-000000000099' })
    expect(res.statusCode).toBe(404)
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '00000000-0000-0000-0000-000000000099', customerId: OWN_CUSTOMER } })
    )
    expect(mockUserDelete).not.toHaveBeenCalled()
  })

  it('PUT /api/users/:id 404s for a user that belongs to a different tenant', async () => {
    setTestUser(ADMIN_USER)
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'user', action: 'write', roleId: 'role-admin', appId: null }])
    mockUserFindFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PUT',
      url: '/api/users/00000000-0000-0000-0000-000000000099',
      payload: { name: 'Renamed' },
    })
    expect(res.statusCode).toBe(404)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })
})

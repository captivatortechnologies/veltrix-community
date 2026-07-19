// ========================================================================
// Tests: GET /api/me/permissions (R1, RBAC/IdP hardening 2026-07-10)
// ========================================================================

import Fastify from 'fastify'
import meRoutes from '../me.route'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../../middlewares/authMiddleware', () => ({
  verifyToken: async (req: any) => {
    req.user = (global as any).__TEST_USER__
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

describe('GET /api/me/permissions', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(meRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => jest.clearAllMocks())

  it('401s when unauthenticated', async () => {
    setTestUser(undefined)
    const res = await app.inject({ method: 'GET', url: '/api/me/permissions' })
    expect(res.statusCode).toBe(401)
  })

  it('returns the resolved permission snapshot for a regular tenant user', async () => {
    setTestUser({ id: 'u1', customerId: 'cust-1', roleId: 'role-1' })
    mockUserFindUnique.mockResolvedValue({
      id: 'u1',
      roleId: 'role-1',
      role: { id: 'role-1', name: 'User' },
    })
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'tool', action: 'read', roleId: 'role-1', appId: null },
      { id: 'p2', resource: 'credential', action: 'all', roleId: 'role-1', appId: null },
      { id: 'p3', resource: 'indexes', action: 'read', roleId: 'role-1', appId: 'app-splunk' },
    ])

    const res = await app.inject({ method: 'GET', url: '/api/me/permissions' })
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body)
    expect(body.wildcards).toEqual({ allAll: false, resources: ['credential'] })
    expect(body.permissions).toEqual(
      expect.arrayContaining([
        { resource: 'tool', action: 'read', appId: null },
        { resource: 'credential', action: 'all', appId: null },
        { resource: 'indexes', action: 'read', appId: 'app-splunk' },
      ]),
    )
  })

  it('returns the allAll wildcard for an Administrator role holding all:all', async () => {
    setTestUser({ id: 'u2', customerId: 'cust-1', roleId: 'role-admin' })
    mockUserFindUnique.mockResolvedValue({
      id: 'u2',
      roleId: 'role-admin',
      role: { id: 'role-admin', name: 'Administrator' },
    })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])

    const res = await app.inject({ method: 'GET', url: '/api/me/permissions' })
    const body = JSON.parse(res.body)

    expect(res.statusCode).toBe(200)
    expect(body.wildcards.allAll).toBe(true)
  })
})

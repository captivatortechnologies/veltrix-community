// ========================================================================
// Tests: component.route — R6 (RBAC/IdP hardening 2026-07-10) gate.
// Component routes were verifyToken+ensureCustomerMatch-only; any
// authenticated tenant member could create/update/delete components
// regardless of role. Now gated by hasPermission('component', 'read'|'write').
// ========================================================================

import Fastify from 'fastify'
import componentRoutes from '../component.route'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    component: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  },
}))

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: async (req: any) => {
      req.user = { id: 'u1', customerId: 'cust-1', roleId: 'role-no-perms' }
      req.headers['x-customer-id'] = 'cust-1'
    },
  }
})

jest.mock('../../../middlewares/cache.middleware', () => ({
  cacheMiddleware: () => async () => undefined,
  invalidateCacheMiddleware: () => async () => undefined,
}))

jest.mock('../../../middlewares/tenant-isolation.middleware', () => ({
  checkTenantQuota: () => async () => undefined,
}))

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

describe('component.route — authorization (R6)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(componentRoutes, { prefix: '/api/components' })
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

  it('403s GET / for a user without component:read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/components/' })
    expect(res.statusCode).toBe(403)
    expect(prisma.component.findMany).not.toHaveBeenCalled()
  })

  it('403s POST / for a user without component:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/components/',
      payload: { type: ['server'], hostname: 'h1', port: '22', toolId: '00000000-0000-0000-0000-000000000001' },
    })
    expect(res.statusCode).toBe(403)
    expect(prisma.component.create).not.toHaveBeenCalled()
  })

  it('persists webPort on create for an authorized user', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-no-perms', appId: null }])
    ;(prisma.component.create as jest.Mock).mockResolvedValue({
      id: 'c1', type: ['server'], hostname: 'h1', port: '8089', webPort: '8000', domains: [], ipRanges: [], tags: [],
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/components/',
      payload: {
        type: ['server'], hostname: 'h1', port: '8089', webPort: '8000',
        toolId: '00000000-0000-0000-0000-000000000001',
      },
    })

    expect(res.statusCode).toBe(201)
    expect(prisma.component.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ webPort: '8000' }) }),
    )
  })

  it('allows GET / for an unrestricted admin (all:all) — the happy path still works', async () => {
    // Note: component routes also run ensureCustomerMatch as a blanket hook
    // with no :customerId URL param, so a non-admin role can only reach the
    // handler for the SAME customer as a URL param would supply — pre-existing
    // behavior, out of scope here. all:all satisfies both checks at once.
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-no-perms', appId: null }])
    ;(prisma.component.findMany as jest.Mock).mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/api/components/' })
    expect(res.statusCode).toBe(200)
  })
})

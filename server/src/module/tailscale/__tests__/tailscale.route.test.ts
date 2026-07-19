// ========================================================================
// Tests: tailscale.route — R6 (RBAC/IdP hardening 2026-07-10) gate.
// Was verifyToken-only (hasPermission was imported but never used); now
// hasPermission('tailscale', 'read'|'write') on device routes, ensureAdmin
// on the platform-wide global-config routes.
// ========================================================================

import Fastify from 'fastify'
import tailscaleRoutes from '../tailscale.route'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
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
    },
  }
})

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

describe('tailscale.route — authorization (R6)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(tailscaleRoutes, { prefix: '/api' })
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

  it('403s GET /tailscale/devices for a user without tailscale:read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tailscale/devices' })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /tailscale/keys for a user without tailscale:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/tailscale/keys',
      payload: {
        componentId: '00000000-0000-0000-0000-000000000001',
        description: 'x',
        customerId: '00000000-0000-0000-0000-000000000002',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s GET /tailscale/global-config for a tenant user WITH tailscale:read but not all:all (genuinely admin-only)', async () => {
    mockQueryRaw.mockResolvedValue([
      { id: 'p1', resource: 'tailscale', action: 'read', roleId: 'role-no-perms', appId: null },
    ])
    const res = await app.inject({ method: 'GET', url: '/api/tailscale/global-config' })
    expect(res.statusCode).toBe(403)
  })

  it('allows GET /tailscale/global-config for an unrestricted admin (all:all)', async () => {
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-no-perms', appId: null }])
    const res = await app.inject({ method: 'GET', url: '/api/tailscale/global-config' })
    // 404 (no config in DB) is fine — the point is it's not 403.
    expect(res.statusCode).not.toBe(403)
  })
})

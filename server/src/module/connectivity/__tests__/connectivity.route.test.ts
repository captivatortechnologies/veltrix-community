// ========================================================================
// Tests: connectivity.route — R6 (RBAC/IdP hardening 2026-07-10) gate.
// Was verifyToken-only; now hasPermission('connectivity', 'read'|'write').
// ========================================================================

import Fastify from 'fastify'
import connectivityRoutes from '../connectivity.route'
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

describe('connectivity.route — authorization (R6)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(connectivityRoutes, { prefix: '/api/connectivity' })
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

  it('403s GET /component/:componentId for a user without connectivity:read', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connectivity/component/00000000-0000-0000-0000-000000000001',
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST / (create/update connectivity) for a user without connectivity:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectivity/',
      payload: { componentId: '00000000-0000-0000-0000-000000000001' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s the Tailscale-key regenerate route without connectivity:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/connectivity/component/00000000-0000-0000-0000-000000000001/regenerate-key',
    })
    expect(res.statusCode).toBe(403)
  })
})

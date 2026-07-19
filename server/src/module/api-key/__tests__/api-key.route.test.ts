// ========================================================================
// Tests: api-key.route — R6 (RBAC/IdP hardening 2026-07-10) gate.
// Was verifyToken-only ("self-scoped" by customerId filtering, but any
// authenticated tenant member — any role — could create/revoke/delete API
// keys, including admin-type keys). Now hasPermission('apiKey', 'read'|'write').
// ========================================================================

import Fastify from 'fastify'
import { apiKeyRoutes } from '../api-key.route'
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
      req.headers['x-customer-id'] = 'cust-1'
    },
  }
})

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock

describe('api-key.route — authorization (R6)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(apiKeyRoutes, { prefix: '/api' })
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

  it('403s GET /api-keys for a user without apiKey:read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/api-keys' })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /api-keys (the original hole: any tenant member could mint an admin-type key) for a user without apiKey:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/api-keys',
      payload: { name: 'Sneaky Admin Key', type: 'admin' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s DELETE /api-keys/:id for a user without apiKey:write', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/api-keys/00000000-0000-0000-0000-000000000001' })
    expect(res.statusCode).toBe(403)
  })
})

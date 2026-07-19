// ========================================================================
// Tests: log-entry.route — R6 (RBAC/IdP hardening 2026-07-10) gate.
// Was verifyToken+extractCustomerId-only; now also hasPermission('logEntry',
// 'read'|'write').
// ========================================================================

import Fastify from 'fastify'
import logEntryRoutes from '../log-entry.route'
import prisma from '../../../db'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    organization: { findUnique: jest.fn() },
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
const mockCustomerFindUnique = prisma.organization.findUnique as jest.Mock

describe('log-entry.route — authorization (R6)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(logEntryRoutes, { prefix: '/api' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])
    // extractCustomerId validates the customer exists + is active before
    // hasPermission ever runs.
    mockCustomerFindUnique.mockResolvedValue({ id: 'cust-1', isActive: true })
  })

  it('403s GET /logs for a user without logEntry:read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/logs' })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /logs for a user without logEntry:write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/logs',
      payload: { level: 'info', source: 'test', message: 'hello' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s DELETE /logs/:id for a user without logEntry:write', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/logs/00000000-0000-0000-0000-000000000001' })
    expect(res.statusCode).toBe(403)
  })
})

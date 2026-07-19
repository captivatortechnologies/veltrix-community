// ========================================================================
// Tests: organization.route — authorization gate.
// GET / and PUT / are gated by hasPermission('organization', 'read'|'write').
// ========================================================================

import Fastify from 'fastify'
import organizationRoutes from '../organization.route'
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

describe('organization.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(organizationRoutes, { prefix: '/api/organization' })
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

  it('403s GET / for a user without organization:read', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/organization/' })
    expect(res.statusCode).toBe(403)
  })

  it('403s PUT / for a user without organization:write', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/organization/', payload: { name: 'Renamed Co' } })
    expect(res.statusCode).toBe(403)
  })
})

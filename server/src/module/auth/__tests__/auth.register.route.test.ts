// ========================================================================
// Tests: POST /auth/register is admin-gated and tenant-scoped
//
// Regression guard for the register tenant-takeover hole (CWE-639). The
// endpoint used to be PUBLIC and honoured a client-supplied `customerId`;
// omitting `roleId` auto-granted that org's Administrator role, so anyone who
// knew an Organization id could self-register as its admin.
//
// The fix has two halves, both asserted here against the REAL middleware
// chain (verifyToken + hasPermission('user','write')) and the real controller:
//   1. Gate    — unauthenticated -> 401, authenticated-without-user:write -> 403
//   2. Scoping — the created user's org comes from the caller's verified token,
//                NEVER the request body (a body customerId is ignored).
// ========================================================================

import Fastify from 'fastify'
import authRoutes from '../auth.route'
import { authService } from '../auth.service'
import prisma from '../../../db'
import { getRolePermissions } from '../../../lib/permissions'

// Mock the auth service so verifyToken's decode and the controller's register
// call are deterministic (and never touch JWT secrets / the DB).
jest.mock('../auth.service', () => ({
  __esModule: true,
  authService: {
    verifyAccessToken: jest.fn(),
    register: jest.fn(),
  },
}))

// Only role.findUnique is exercised (by verifyToken + hasPermission).
jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
  },
}))

// Keep the REAL checkPermission (pure wildcard logic) so the gate is tested
// faithfully; stub only the DB-backed permission fetch.
jest.mock('../../../lib/permissions', () => {
  const actual = jest.requireActual('../../../lib/permissions')
  return { __esModule: true, ...actual, getRolePermissions: jest.fn() }
})

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockVerify = authService.verifyAccessToken as jest.Mock
const mockRegister = authService.register as jest.Mock
const mockRoleFind = prisma.role.findUnique as jest.Mock
const mockGetPerms = getRolePermissions as jest.Mock

const VALID_BODY = { name: 'New User', email: 'new@example.com', password: 'password123' }

/** Seed an authenticated caller with the given role + granted permissions. */
function authenticateAs(opts: {
  customerId: string
  roleId: string
  roleName: string
  permissions: Array<{ resource: string; action: string }>
}) {
  mockVerify.mockReturnValue({ userId: 'caller-1', customerId: opts.customerId, roleId: opts.roleId })
  mockRoleFind.mockResolvedValue({ id: opts.roleId, name: opts.roleName })
  mockGetPerms.mockResolvedValue(
    opts.permissions.map((p) => ({ ...p, roleId: opts.roleId, appId: null })),
  )
}

describe('POST /auth/register — admin-gated + tenant-scoped (CWE-639 fix)', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    await app.register(authRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => jest.clearAllMocks())

  it('rejects an unauthenticated caller (no Bearer token) with 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: VALID_BODY })

    expect(res.statusCode).toBe(401)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('rejects an authenticated caller lacking user:write with 403', async () => {
    authenticateAs({
      customerId: 'cust-1',
      roleId: 'role-viewer',
      roleName: 'Viewer',
      permissions: [{ resource: 'tool', action: 'read' }],
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer viewer-token' },
      payload: VALID_BODY,
    })

    expect(res.statusCode).toBe(403)
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('provisions the user in the ADMIN\'s org and IGNORES a body-supplied customerId', async () => {
    authenticateAs({
      customerId: 'admin-org',
      roleId: 'role-admin',
      roleName: 'Administrator',
      permissions: [{ resource: 'all', action: 'all' }],
    })
    mockRegister.mockResolvedValue({
      token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_expires_in: 86400,
      user: {
        id: 'new-user',
        email: 'new@example.com',
        name: 'New User',
        role: 'User',
        customerId: 'admin-org',
        isPlatformAdmin: false,
      },
      permissions: { allAll: false, wildcards: { allAll: false, resources: [] }, permissions: [] },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer admin-token' },
      // An attacker-style payload targeting a DIFFERENT org — must be ignored.
      payload: { ...VALID_BODY, customerId: 'victim-org-999' },
    })

    expect(res.statusCode).toBe(201)
    expect(mockRegister).toHaveBeenCalledTimes(1)

    const passedData = mockRegister.mock.calls[0][0]
    // Tenancy is the caller's verified org, never the body value.
    expect(passedData.customerId).toBe('admin-org')
    expect(passedData.customerId).not.toBe('victim-org-999')
  })
})

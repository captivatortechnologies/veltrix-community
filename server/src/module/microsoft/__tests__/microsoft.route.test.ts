// ========================================================================
// Tests: microsoft.route — URGENT security fix (2026-07-11).
//
// GET /microsoft used to be fully public AND returned the decrypted
// clientSecret to ANY caller. It stays public (SignupPage/LoginPage need it
// pre-login to decide whether to render a "Sign in with Microsoft" button),
// but the secret is now ALWAYS redacted (hasClientSecret presence flag
// only), and the tenant scope is resolved from a VERIFIED JWT rather than
// the client-supplied X-Customer-ID header. Mutating routes require
// verifyToken + ensureAdmin. Save is preserve-on-omit.
// ========================================================================

import Fastify from 'fastify'
import microsoftRoutes from '../microsoft.route'
import prisma from '../../../db'
import { encryptFields } from '../../../utils/encryption'
import { authService } from '../../auth/auth.service'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    customerIdentityProvider: { findFirst: jest.fn() },
    identityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    organization: { findFirst: jest.fn() },
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../../middlewares/authMiddleware', () => {
  const actual = jest.requireActual('../../../middlewares/authMiddleware')
  return {
    ...actual,
    verifyToken: async (req: any) => {
      req.user = (global as any).__TEST_USER__
      if (req.user) req.headers['x-customer-id'] = req.user.customerId
    },
  }
})

jest.mock('../../auth/auth.service', () => ({
  authService: { verifyAccessToken: jest.fn() },
}))

const mockRoleFindUnique = prisma.role.findUnique as jest.Mock
const mockQueryRaw = prisma.$queryRaw as jest.Mock
const mockIdentityProviderFindFirst = prisma.identityProvider.findFirst as jest.Mock
const mockCustomerIdentityProviderFindFirst = prisma.customerIdentityProvider.findFirst as jest.Mock
const mockIdentityProviderUpdate = prisma.identityProvider.update as jest.Mock
const mockIdentityProviderCreate = prisma.identityProvider.create as jest.Mock
const mockVerifyAccessToken = authService.verifyAccessToken as jest.Mock

function setTestUser(user: { id: string; customerId: string; roleId: string } | undefined) {
  ;(global as any).__TEST_USER__ = user
}

const ADMIN_USER = { id: 'admin-1', customerId: 'cust-1', roleId: 'role-admin' }
const NO_PERMS_USER = { id: 'u1', customerId: 'cust-1', roleId: 'role-no-perms' }

describe('microsoft.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(microsoftRoutes, { prefix: '/api/microsoft' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])
    mockIdentityProviderFindFirst.mockResolvedValue(null)
    mockCustomerIdentityProviderFindFirst.mockResolvedValue(null)
    mockVerifyAccessToken.mockReturnValue(null)
  })

  it('GET / stays reachable with NO Authorization header (pre-login SSO-button check)', async () => {
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ clientId: 'public-client-id', clientSecret: 's3cr3t', tenantId: 'common', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })

    const res = await app.inject({ method: 'GET', url: '/api/microsoft/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.enabled).toBe(true)
    expect(body.clientId).toBe('public-client-id')
  })

  it('GET / NEVER returns the decrypted clientSecret, even unauthenticated', async () => {
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ clientId: 'x', clientSecret: 'super-secret-value', tenantId: 'common', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })

    const res = await app.inject({ method: 'GET', url: '/api/microsoft/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientSecret).toBe('')
    expect(body.hasClientSecret).toBe(true)
    expect(JSON.stringify(body)).not.toContain('super-secret-value')
  })

  it('401s POST /config when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/microsoft/config',
      payload: { enabled: true, clientId: 'x', clientSecret: 'shh', tenantId: 'common' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403s POST /config for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({
      method: 'POST',
      url: '/api/microsoft/config',
      payload: { enabled: true, clientId: 'x', clientSecret: 'shh', tenantId: 'common' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('save preserve-on-omit: an empty clientSecret keeps the stored one instead of wiping it', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])

    const stored = encryptFields(
      { clientId: 'old-client-id', clientSecret: 'already-stored-secret', tenantId: 'common', redirectUri: 'https://x/y', scope: 'openid', jitMode: 'domain-match' },
      ['clientSecret']
    )
    mockIdentityProviderFindFirst.mockResolvedValue({ id: 'row-1', enabled: true, config: JSON.stringify(stored) })
    mockIdentityProviderUpdate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/microsoft/config',
      payload: { enabled: true, clientId: 'new-client-id', clientSecret: '', tenantId: 'common', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockIdentityProviderUpdate).toHaveBeenCalledTimes(1)
    const savedConfig = JSON.parse((mockIdentityProviderUpdate.mock.calls[0][0].data.config as string))
    const { decryptFields } = jest.requireActual('../../../utils/encryption')
    const decrypted = decryptFields(savedConfig, ['clientSecret'])
    expect(decrypted.clientSecret).toBe('already-stored-secret')
    expect(decrypted.clientId).toBe('new-client-id')
  })

  it('POST /config accepts jitMode (I4 schema fix — previously silently stripped)', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null)
    mockIdentityProviderCreate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/microsoft/config',
      payload: {
        enabled: true,
        clientId: 'new-client-id',
        clientSecret: 'brand-new-secret',
        tenantId: 'common',
        redirectUri: 'https://x/y',
        scope: 'openid',
        jitMode: 'disabled',
      },
    })

    expect(res.statusCode).toBe(200)
    const savedConfig = JSON.parse((mockIdentityProviderCreate.mock.calls[0][0].data.config as string))
    expect(savedConfig.jitMode).toBe('disabled')
  })
})

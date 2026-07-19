// ========================================================================
// Tests: google.route — URGENT security fix (2026-07-11).
//
// GET /google used to be fully public AND returned the decrypted
// clientSecret to ANY caller (curl localhost:5000/api/google ->
// {"clientSecret":"..."}). It stays public (SignupPage/LoginPage need it
// pre-login to decide whether to render a "Sign in with Google" button),
// but the secret is now ALWAYS redacted (hasClientSecret presence flag
// only), and the tenant scope is resolved from a VERIFIED JWT rather than
// the client-supplied X-Customer-ID header (closing the tenant-spoofing
// half of the bug). Mutating routes (save/reset/test-connection) require
// verifyToken + ensureAdmin. Save is preserve-on-omit.
// ========================================================================

import Fastify from 'fastify'
import googleRoutes from '../google.route'
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

// verifyToken (used only by the mutating routes) is mocked the usual way;
// tryResolveVerifiedCustomerId (used by the public GET) decodes via the
// REAL authService.verifyAccessToken, so we mock that directly instead.
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

describe('google.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(googleRoutes, { prefix: '/api/google' })
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
      config: JSON.stringify(encryptFields({ clientId: 'public-client-id', clientSecret: 's3cr3t', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })

    const res = await app.inject({ method: 'GET', url: '/api/google/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.enabled).toBe(true)
    expect(body.clientId).toBe('public-client-id') // non-secret, needed to render/redirect
  })

  it('GET / NEVER returns the decrypted clientSecret, even unauthenticated', async () => {
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ clientId: 'x', clientSecret: 'super-secret-value', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })

    const res = await app.inject({ method: 'GET', url: '/api/google/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientSecret).toBe('')
    expect(body.hasClientSecret).toBe(true)
    expect(JSON.stringify(body)).not.toContain('super-secret-value')
  })

  it('GET / ignores a client-supplied X-Customer-ID header when unauthenticated (tenant-spoofing closed)', async () => {
    // A customer-specific row exists for cust-1, but the caller sends no
    // valid token — only an attacker-controlled header. It must NOT be used.
    mockCustomerIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ clientId: 'tenant-specific-client', clientSecret: 'tenant-secret', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ clientId: 'global-client', clientSecret: 'global-secret', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])),
    })

    const res = await app.inject({ method: 'GET', url: '/api/google/', headers: { 'x-customer-id': 'cust-1' } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    // Falls back to the GLOBAL config — the spoofed header was never trusted.
    expect(body.clientId).toBe('global-client')
    expect(mockCustomerIdentityProviderFindFirst).not.toHaveBeenCalled()
  })

  it('401s POST /config when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/google/config', payload: { enabled: true, clientId: 'x', clientSecret: 'shh' } })
    expect(res.statusCode).toBe(401)
  })

  it('403s POST /config for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({
      method: 'POST',
      url: '/api/google/config',
      payload: { enabled: true, clientId: 'x', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /test-connection for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({ method: 'POST', url: '/api/google/test-connection', payload: {} })
    expect(res.statusCode).toBe(403)
  })

  it('save preserve-on-omit: an empty clientSecret keeps the stored one instead of wiping it', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])

    const stored = encryptFields(
      { clientId: 'old-client-id', clientSecret: 'already-stored-secret', redirectUri: 'https://x/y', scope: 'openid', jitMode: 'domain-match' },
      ['clientSecret']
    )
    mockIdentityProviderFindFirst.mockResolvedValue({ id: 'row-1', enabled: true, config: JSON.stringify(stored) })
    mockIdentityProviderUpdate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/google/config',
      payload: { enabled: true, clientId: 'new-client-id', clientSecret: '', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockIdentityProviderUpdate).toHaveBeenCalledTimes(1)
    const savedConfig = JSON.parse((mockIdentityProviderUpdate.mock.calls[0][0].data.config as string))
    const { decryptFields } = jest.requireActual('../../../utils/encryption')
    const decrypted = decryptFields(savedConfig, ['clientSecret'])
    expect(decrypted.clientSecret).toBe('already-stored-secret')
    expect(decrypted.clientId).toBe('new-client-id')
  })

  it('save with a real secret overwrites the stored one', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null) // brand-new global config
    mockIdentityProviderCreate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/google/config',
      payload: { enabled: true, clientId: 'new-client-id', clientSecret: 'brand-new-secret', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockIdentityProviderCreate).toHaveBeenCalledTimes(1)
    const savedConfig = JSON.parse((mockIdentityProviderCreate.mock.calls[0][0].data.config as string))
    const { decryptFields } = jest.requireActual('../../../utils/encryption')
    const decrypted = decryptFields(savedConfig, ['clientSecret'])
    expect(decrypted.clientSecret).toBe('brand-new-secret')
  })

  it('save 400s when no secret was ever stored and none is submitted', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/google/config',
      payload: { enabled: true, clientId: 'new-client-id' },
    })

    expect(res.statusCode).toBe(400)
    expect(mockIdentityProviderCreate).not.toHaveBeenCalled()
  })
})

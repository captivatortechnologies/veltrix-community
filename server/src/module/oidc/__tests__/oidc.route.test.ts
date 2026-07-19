// ========================================================================
// Tests: oidc.route — authorization, secret redaction, preserve-on-omit.
//
// Mirrors google.route.test.ts's proven pattern. GET / is deliberately
// public (pre-login SSO-button check) but NEVER returns the decrypted
// clientSecret (hasClientSecret presence flag only), and resolves tenant
// scope from a VERIFIED JWT (tryResolveVerifiedCustomerId), never a
// client-supplied X-Customer-ID header. Mutating routes (save/reset/
// test-connection) require verifyToken + ensureAdmin and resolve tenant
// scope from `request.user.customerId` (the verified JWT claim
// `verifyToken` attaches) rather than reading the header directly.
// ========================================================================

import Fastify from 'fastify'
import oidcRoutes from '../oidc.route'
import prisma from '../../../db'
import { encryptFields, decryptFields } from '../../../utils/encryption'
import { authService } from '../../auth/auth.service'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    role: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    customerIdentityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    identityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    organization: { findFirst: jest.fn() },
    // Referenced by the tenant-isolation `requireTierFeature` gate this
    // route imports (see setTestUser below). In this OSS build that gate is
    // a no-op stub that never touches the database — this mock is kept only
    // so the test is inert either way (stub short-circuits before using it,
    // or a future change queries it and finds a harmless mock).
    subscription: { findUnique: jest.fn() },
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
  // SSO/IdP config requires a paid tier (requireTierFeature); default an
  // authenticated tenant to paid so the config routes reach the logic under test.
  if (user) (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ tier: 'enterprise' })
}

const ADMIN_USER = { id: 'admin-1', customerId: 'cust-1', roleId: 'role-admin' }
const NO_PERMS_USER = { id: 'u1', customerId: 'cust-1', roleId: 'role-no-perms' }

describe('oidc.route — authorization + redaction', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(oidcRoutes, { prefix: '/api/oidc' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    // Every test starts unauthenticated by default — otherwise a later
    // test's setTestUser(...) call would leak into a subsequent
    // "unauthenticated" test via the shared `global.__TEST_USER__`.
    setTestUser(undefined)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-no-perms', name: 'RegularUser' })
    mockQueryRaw.mockResolvedValue([])
    mockIdentityProviderFindFirst.mockResolvedValue(null)
    mockCustomerIdentityProviderFindFirst.mockResolvedValue(null)
    mockVerifyAccessToken.mockReturnValue(null)
  })

  it('GET / stays reachable with NO Authorization header (pre-login SSO-button check)', async () => {
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(
        encryptFields({ issuer: 'https://issuer.example.com', clientId: 'public-client-id', clientSecret: 's3cr3t', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])
      ),
    })

    const res = await app.inject({ method: 'GET', url: '/api/oidc/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.enabled).toBe(true)
    expect(body.issuer).toBe('https://issuer.example.com')
    expect(body.clientId).toBe('public-client-id') // non-secret, needed to render/redirect
  })

  it('GET / NEVER returns the decrypted clientSecret, even unauthenticated', async () => {
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(
        encryptFields({ issuer: 'https://issuer.example.com', clientId: 'x', clientSecret: 'super-secret-value', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])
      ),
    })

    const res = await app.inject({ method: 'GET', url: '/api/oidc/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientSecret).toBe('')
    expect(body.hasClientSecret).toBe(true)
    expect(JSON.stringify(body)).not.toContain('super-secret-value')
  })

  it('GET /?emailHint= resolves a customer-specific config for an anonymous caller (pre-login SSO-button visibility)', async () => {
    mockCustomerIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(
        encryptFields({ issuer: 'https://tenant-issuer.example.com', clientId: 'tenant-specific-client', clientSecret: 'tenant-secret', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])
      ),
    })
    mockQueryRaw.mockResolvedValue([])
    ;(prisma.organization.findFirst as jest.Mock).mockResolvedValue({ id: 'cust-1' })

    const res = await app.inject({ method: 'GET', url: '/api/oidc/?emailHint=someone%40acme.com' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.issuer).toBe('https://tenant-issuer.example.com')
    expect(body.isCustomerSpecific).toBe(true)
    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ domain: { equals: 'acme.com', mode: 'insensitive' } }) })
    )
  })

  it('GET / ignores a client-supplied X-Customer-ID header when unauthenticated (tenant-spoofing closed)', async () => {
    mockCustomerIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(
        encryptFields({ issuer: 'https://tenant-issuer.example.com', clientId: 'tenant-specific-client', clientSecret: 'tenant-secret', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])
      ),
    })
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(
        encryptFields({ issuer: 'https://global-issuer.example.com', clientId: 'global-client', clientSecret: 'global-secret', redirectUri: 'https://x/y', scope: 'openid' }, ['clientSecret'])
      ),
    })

    const res = await app.inject({ method: 'GET', url: '/api/oidc/', headers: { 'x-customer-id': 'cust-1' } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientId).toBe('global-client')
    expect(mockCustomerIdentityProviderFindFirst).not.toHaveBeenCalled()
  })

  it('401s POST /config when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'x', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403s POST /config for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'x', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /test-connection for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({ method: 'POST', url: '/api/oidc/test-connection', payload: {} })
    expect(res.statusCode).toBe(403)
  })

  it('401s DELETE /config/reset when unauthenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/oidc/config/reset' })
    expect(res.statusCode).toBe(401)
  })

  it('save resolves tenant scope from the verified JWT (request.user), not a client-supplied header', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockCustomerIdentityProviderFindFirst.mockResolvedValue(null)
    mockCustomerIdentityProviderFindFirst.mockResolvedValueOnce(null) // getStoredOidcClientSecret lookup
    ;(prisma.customerIdentityProvider.create as jest.Mock).mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      // Deliberately send a DIFFERENT (attacker-controlled) customer id in
      // the header — a real X-Customer-ID header is attacker-controlled on
      // the wire; only the bearer-token-derived request.user.customerId
      // (cust-1, from ADMIN_USER) must be used.
      headers: { 'x-customer-id': 'attacker-controlled-cust-id' },
      payload: {
        enabled: true,
        issuer: 'https://issuer.example.com',
        clientId: 'new-client-id',
        clientSecret: 'brand-new-secret',
        redirectUri: 'https://x/y',
        scope: 'openid',
        isCustomerSpecific: true,
      },
    })

    expect(res.statusCode).toBe(200)
    const created = (prisma.customerIdentityProvider.create as jest.Mock).mock.calls[0][0]
    expect(created.data.customerId).toBe('cust-1') // ADMIN_USER's verified customerId, not the header
  })

  it('save preserve-on-omit: an empty clientSecret keeps the stored one instead of wiping it', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])

    const stored = encryptFields(
      { issuer: 'https://issuer.example.com', clientId: 'old-client-id', clientSecret: 'already-stored-secret', redirectUri: 'https://x/y', scope: 'openid', jitMode: 'domain-match' },
      ['clientSecret']
    )
    mockIdentityProviderFindFirst.mockResolvedValue({ id: 'row-1', enabled: true, config: JSON.stringify(stored) })
    mockIdentityProviderUpdate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'new-client-id', clientSecret: '', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockIdentityProviderUpdate).toHaveBeenCalledTimes(1)
    const savedConfig = JSON.parse(mockIdentityProviderUpdate.mock.calls[0][0].data.config as string)
    const decrypted = decryptFields(savedConfig, ['clientSecret'])
    expect(decrypted.clientSecret).toBe('already-stored-secret')
    expect(decrypted.clientId).toBe('new-client-id')
  })

  it('save with a real secret overwrites the stored one', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null)
    mockIdentityProviderCreate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'new-client-id', clientSecret: 'brand-new-secret', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockIdentityProviderCreate).toHaveBeenCalledTimes(1)
    const savedConfig = JSON.parse(mockIdentityProviderCreate.mock.calls[0][0].data.config as string)
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
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'new-client-id' },
    })

    expect(res.statusCode).toBe(400)
    expect(mockIdentityProviderCreate).not.toHaveBeenCalled()
  })

  it('save 400s when the issuer is not a valid http(s) URL', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/oidc/config',
      payload: { enabled: true, issuer: 'not-a-url', clientId: 'x', clientSecret: 'secret', redirectUri: 'https://x/y', scope: 'openid' },
    })

    expect(res.statusCode).toBe(400)
    expect(mockIdentityProviderCreate).not.toHaveBeenCalled()
  })
})

// ========================================================================
// Tests: cognito.route — URGENT security fix (2026-07-11).
//
// GET /cognito used to be fully public AND returned the decrypted
// clientSecret + AWS awsSecretAccessKey to ANY caller. It stays public
// (SignupPage/LoginPage need it pre-login — LoginPage's CognitoAuthProvider
// even needs userPoolId/clientId/redirectUri/logoutUri/scope client-side to
// build the Hosted UI redirect), but both secrets are now ALWAYS redacted
// (hasClientSecret/hasAwsSecretAccessKey presence flags only) while
// awsAccessKeyId — a non-secret identifier — is still returned. The tenant
// scope is resolved from a VERIFIED JWT rather than the client-supplied
// X-Customer-ID header. Mutating routes require verifyToken + ensureAdmin.
// Save is preserve-on-omit for both secrets.
// ========================================================================

import Fastify from 'fastify'
import cognitoRoutes from '../cognito.route'
import prisma from '../../../db'
import { encryptFields } from '../../../utils/encryption'
import { authService } from '../../auth/auth.service'

const SENSITIVE_CONFIG_FIELDS = ['clientSecret', 'awsAccessKeyId', 'awsSecretAccessKey']

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

describe('cognito.route — authorization', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(cognitoRoutes, { prefix: '/api/cognito' })
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
      config: JSON.stringify(
        encryptFields(
          { userPoolId: 'us-east-1_Test', clientId: 'public-client-id', clientSecret: 's3cr3t', redirectUri: 'https://x/y', logoutUri: 'https://x', scope: 'openid' },
          SENSITIVE_CONFIG_FIELDS
        )
      ),
    })

    const res = await app.inject({ method: 'GET', url: '/api/cognito/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.enabled).toBe(true)
    expect(body.clientId).toBe('public-client-id')
  })

  it('401s POST /config when unauthenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cognito/config',
      payload: { enabled: true, userPoolId: 'us-east-1_Test', clientId: 'x', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('403s POST /config for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({
      method: 'POST',
      url: '/api/cognito/config',
      payload: { enabled: true, userPoolId: 'us-east-1_Test', clientId: 'x', clientSecret: 'shh' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('403s POST /disable-for-sso for an authenticated non-admin', async () => {
    setTestUser(NO_PERMS_USER)
    const res = await app.inject({ method: 'POST', url: '/api/cognito/disable-for-sso', payload: { ssoType: 'GOOGLE' } })
    expect(res.statusCode).toBe(403)
  })

  it('GET / NEVER returns clientSecret or awsSecretAccessKey in plaintext (curl-confirmed leak), even unauthenticated', async () => {
    const stored = encryptFields(
      {
        userPoolId: 'us-east-1_Test',
        userPoolRegion: 'us-east-1',
        clientId: 'real-client-id',
        clientSecret: 'super-secret-value',
        redirectUri: 'https://x/y',
        logoutUri: 'https://x',
        scope: 'openid',
        jitMode: 'domain-match',
        domain: 'x.auth.us-east-1.amazoncognito.com',
        awsAccessKeyId: 'AKIA_VISIBLE_ID',
        awsSecretAccessKey: 'super-secret-aws-key',
      },
      SENSITIVE_CONFIG_FIELDS
    )
    mockIdentityProviderFindFirst.mockResolvedValue({ enabled: true, config: JSON.stringify(stored) })

    const res = await app.inject({ method: 'GET', url: '/api/cognito/' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    expect(body.clientId).toBe('real-client-id');
    expect(body.clientSecret).toBe('')
    expect(body.hasClientSecret).toBe(true)
    expect(body.awsSecretAccessKey).toBe('')
    expect(body.hasAwsSecretAccessKey).toBe(true)
    // awsAccessKeyId is a non-secret identifier (like clientId) — still returned.
    expect(body.awsAccessKeyId).toBe('AKIA_VISIBLE_ID')

    expect(JSON.stringify(body)).not.toContain('super-secret-value')
    expect(JSON.stringify(body)).not.toContain('super-secret-aws-key')
  })

  it('GET / ignores a client-supplied X-Customer-ID header when unauthenticated (tenant-spoofing closed)', async () => {
    mockCustomerIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ userPoolId: 'us-east-1_Tenant', clientId: 'tenant-client', clientSecret: 'tenant-secret' }, SENSITIVE_CONFIG_FIELDS)),
    })
    mockIdentityProviderFindFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify(encryptFields({ userPoolId: 'us-east-1_Global', clientId: 'global-client', clientSecret: 'global-secret' }, SENSITIVE_CONFIG_FIELDS)),
    })

    const res = await app.inject({ method: 'GET', url: '/api/cognito/', headers: { 'x-customer-id': 'cust-1' } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientId).toBe('global-client')
    expect(mockCustomerIdentityProviderFindFirst).not.toHaveBeenCalled()
  })

  it('save preserve-on-omit: empty clientSecret AND awsSecretAccessKey keep the stored values', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])

    const stored = encryptFields(
      {
        userPoolId: 'us-east-1_Test',
        userPoolRegion: 'us-east-1',
        clientId: 'old-client-id',
        clientSecret: 'already-stored-secret',
        redirectUri: 'https://x/y',
        logoutUri: 'https://x',
        scope: 'openid',
        jitMode: 'domain-match',
        awsAccessKeyId: 'AKIA_OLD',
        awsSecretAccessKey: 'already-stored-aws-secret',
      },
      SENSITIVE_CONFIG_FIELDS
    )
    mockIdentityProviderFindFirst.mockResolvedValue({ id: 'row-1', enabled: true, config: JSON.stringify(stored) })
    mockIdentityProviderUpdate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/cognito/config',
      payload: {
        enabled: true,
        userPoolId: 'us-east-1_Test',
        clientId: 'new-client-id',
        clientSecret: '',
        awsAccessKeyId: 'AKIA_NEW',
        awsSecretAccessKey: '',
      },
    })

    expect(res.statusCode).toBe(200)
    const savedConfig = JSON.parse((mockIdentityProviderUpdate.mock.calls[0][0].data.config as string))
    const { decryptFields } = jest.requireActual('../../../utils/encryption')
    const decrypted = decryptFields(savedConfig, SENSITIVE_CONFIG_FIELDS)

    expect(decrypted.clientSecret).toBe('already-stored-secret')
    expect(decrypted.awsSecretAccessKey).toBe('already-stored-aws-secret')
    expect(decrypted.clientId).toBe('new-client-id')
    expect(decrypted.awsAccessKeyId).toBe('AKIA_NEW')
  })

  it('POST /config actually persists awsAccessKeyId/awsSecretAccessKey (I5 schema fix — previously silently stripped)', async () => {
    setTestUser(ADMIN_USER)
    mockRoleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'Administrator' })
    mockQueryRaw.mockResolvedValue([{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }])
    mockIdentityProviderFindFirst.mockResolvedValue(null)
    mockIdentityProviderCreate.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/cognito/config',
      payload: {
        enabled: true,
        userPoolId: 'us-east-1_Test',
        clientId: 'client-1',
        clientSecret: 'brand-new-secret',
        awsAccessKeyId: 'AKIA_BRAND_NEW',
        awsSecretAccessKey: 'brand-new-aws-secret',
      },
    })

    expect(res.statusCode).toBe(200)
    const savedConfig = JSON.parse((mockIdentityProviderCreate.mock.calls[0][0].data.config as string))
    const { decryptFields } = jest.requireActual('../../../utils/encryption')
    const decrypted = decryptFields(savedConfig, SENSITIVE_CONFIG_FIELDS)
    expect(decrypted.awsAccessKeyId).toBe('AKIA_BRAND_NEW')
    expect(decrypted.awsSecretAccessKey).toBe('brand-new-aws-secret')
  })
})

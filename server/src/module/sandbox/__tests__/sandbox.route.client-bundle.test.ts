// ========================================================================
// Sandbox Client Bundle Route Tests (S6.5) — auth + feature-flag + tenancy
//
// Boots a real Fastify instance with the sandbox routes and mocked auth
// middlewares / db / sandbox-client-bundle service. Verifies the HTTP layer:
//   - SANDBOX_ENABLED off -> 404 for the whole module
//   - sandbox:read is sufficient (unlike write-scoped file routes, this is a
//     read of already-synced content)
//   - cross-tenant sandbox id is a 404 (invisible), without ever bundling
//   - service errors (SandboxError) map to their declared status codes
//   - a successful bundle is served as raw JavaScript with the right headers
// Bundle resolution/esbuild/caching logic is covered directly in
// sandbox-client-bundle.test.ts; this file only verifies request -> service
// -> response wiring, exactly like sandbox.route.file.test.ts does for the
// file endpoints.
// ========================================================================

import fastify, { type FastifyInstance } from 'fastify'
import prisma from '../../../db'
import { isFeatureEnabled } from '../../../config/feature-flags'
import { getSandboxClientBundle } from '../sandbox-client-bundle'
import { SandboxError } from '../sandbox.service'
import { sandboxRoutes } from '../sandbox.route'

jest.mock('../../../config/feature-flags', () => ({ isFeatureEnabled: jest.fn() }))

jest.mock('../../../middlewares/authMiddleware', () => ({
  verifyToken: jest.fn(async (request: { user?: unknown }) => {
    request.user = jwtPrincipal
  }),
}))

jest.mock('../../../middlewares/apiKeyMiddleware', () => ({
  verifyApiKey: jest.fn(async (request: { user?: unknown }) => {
    request.user = apiKeyPrincipal
  }),
}))

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    sandbox: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('../sandbox-client-bundle', () => ({
  getSandboxClientBundle: jest.fn(),
}))

// Keep the module light: only the client-bundle route is under test here.
jest.mock('../file.service', () => ({
  fileService: { readFile: jest.fn(), writeFile: jest.fn(), deleteFile: jest.fn() },
}))
jest.mock('../sync.service', () => ({
  __esModule: true,
  syncService: {},
  listFiles: jest.fn(),
  getManifestSummary: jest.fn(),
}))
jest.mock('../run.service', () => ({ SANDBOX_TAG_NAME: 'sandbox', runService: { runHandler: jest.fn() } }))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const CUSTOMER_A = '11111111-1111-4111-a111-111111111111'
const CUSTOMER_B = '22222222-2222-4222-a222-222222222222'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

let apiKeyPrincipal: Record<string, unknown>
let jwtPrincipal: Record<string, unknown>

const mockPrisma = prisma as unknown as { sandbox: { findFirst: jest.Mock }; $queryRaw: jest.Mock }
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock
const mockGetSandboxClientBundle = getSandboxClientBundle as jest.Mock

const SANDBOX_ROW = {
  id: SANDBOX_ID,
  customerId: CUSTOMER_A,
  name: 'local-dev',
  appId: 'splunk-enterprise',
  status: 'ACTIVE',
  createdById: null,
  lastSyncAt: new Date(),
  fileCount: 38,
  sizeBytes: 177063,
  expiresAt: new Date(Date.now() + 86400000),
  createdAt: new Date(),
  updatedAt: new Date(),
}

const BUNDLE_CODE = 'const rt = globalThis.__VELTRIX_APP_RUNTIME__;\nexport default { id: "splunk-enterprise", pages: {} };\n'

describe('Sandbox client bundle route', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = fastify({ ajv: { customOptions: { allowUnionTypes: true } } })
    await app.register(sandboxRoutes, { prefix: '/api/sandboxes' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsFeatureEnabled.mockReturnValue(true)
    apiKeyPrincipal = {
      id: '00000000-0000-4000-a000-000000000002',
      customerId: CUSTOMER_A,
      roleId: 'role-api',
      apiKey: true,
      apiKeyScopes: ['sandbox:read'],
    }
    jwtPrincipal = { id: 'user-1', customerId: CUSTOMER_A, roleId: 'role-1' }
    mockPrisma.sandbox.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; customerId: string } }) =>
        where.id === SANDBOX_ID && where.customerId === CUSTOMER_A ? SANDBOX_ROW : null,
    )
    mockGetSandboxClientBundle.mockResolvedValue(BUNDLE_CODE)
  })

  function inject(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: 'GET',
      url: `/api/sandboxes/${SANDBOX_ID}/client.mjs`,
      headers: { authorization: 'ApiKey k' },
      ...overrides,
    })
  }

  it('is invisible (404) while SANDBOX_ENABLED is off', async () => {
    mockIsFeatureEnabled.mockReturnValue(false)
    const res = await inject()
    expect(res.statusCode).toBe(404)
    expect(mockGetSandboxClientBundle).not.toHaveBeenCalled()
  })

  it('rejects requests with no credentials (401)', async () => {
    const res = await inject({ headers: {} })
    expect(res.statusCode).toBe(401)
    expect(mockGetSandboxClientBundle).not.toHaveBeenCalled()
  })

  it('accepts an API key with only sandbox:read (no write scope required)', async () => {
    apiKeyPrincipal.apiKeyScopes = ['sandbox:read']
    const res = await inject()
    expect(res.statusCode).toBe(200)
  })

  it('rejects an API key with neither read nor write scope (403)', async () => {
    apiKeyPrincipal.apiKeyScopes = ['other:scope']
    const res = await inject()
    expect(res.statusCode).toBe(403)
    expect(mockGetSandboxClientBundle).not.toHaveBeenCalled()
  })

  it('serves the bundle as raw JavaScript with no-store + nosniff headers', async () => {
    const res = await inject()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.payload).toBe(BUNDLE_CODE)
    expect(mockGetSandboxClientBundle).toHaveBeenCalledWith(SANDBOX_ROW)
  })

  it('JWT callers need the sandbox:manage RBAC permission', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])
    const denied = await inject({ headers: { authorization: 'Bearer jwt', 'x-role-id': 'role-1' } })
    expect(denied.statusCode).toBe(403)

    mockPrisma.$queryRaw.mockResolvedValue([{ resource: 'sandbox', action: 'manage' }])
    const allowed = await inject({ headers: { authorization: 'Bearer jwt', 'x-role-id': 'role-1' } })
    expect(allowed.statusCode).toBe(200)
  })

  it('maps a "no client bundle" 404 from the service', async () => {
    mockGetSandboxClientBundle.mockRejectedValue(new SandboxError('Sandbox app has no client bundle', 404))
    const res = await inject()
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'Sandbox app has no client bundle' })
  })

  it('maps an oversized-bundle 413 from the service', async () => {
    mockGetSandboxClientBundle.mockRejectedValue(new SandboxError('too big', 413))
    const res = await inject()
    expect(res.statusCode).toBe(413)
  })

  it('maps an unexpected build failure to a 500', async () => {
    mockGetSandboxClientBundle.mockRejectedValue(new Error('Transform failed with 1 error'))
    const res = await inject()
    expect(res.statusCode).toBe(500)
  })

  it('404s across tenants without ever bundling anything', async () => {
    apiKeyPrincipal.customerId = CUSTOMER_B
    const res = await inject()
    expect(res.statusCode).toBe(404)
    expect(mockGetSandboxClientBundle).not.toHaveBeenCalled()
  })
})

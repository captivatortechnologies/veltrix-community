// ========================================================================
// Sandbox /run Route Tests (auth + feature-flag gating + serialization)
//
// Boots a real Fastify instance with the sandbox routes and mocked auth
// middlewares / db / run service. Verifies:
//   - SANDBOX_ENABLED off -> 404 for the whole module
//   - API key scope enforcement (sandbox:write required on /run)
//   - JWT RBAC path (x-role-id + sandbox:manage permission)
//   - schema-level rejection of deploy/rollback
//   - tenancy: another tenant's sandbox id is a 404 (invisible)
//   - response serialization keeps every declared field (incl. result)
// ========================================================================

import fastify, { type FastifyInstance } from 'fastify'
import prisma from '../../../db'
import { isFeatureEnabled } from '../../../config/feature-flags'
import { runService } from '../run.service'
import { sandboxRoutes } from '../sandbox.route'

jest.mock('../../../config/feature-flags', () => ({
  isFeatureEnabled: jest.fn(),
}))

// Auth middlewares are mocked to authenticate as whatever the test configures.
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

jest.mock('../run.service', () => ({
  SANDBOX_TAG_NAME: 'sandbox',
  runService: { runHandler: jest.fn() },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

const CUSTOMER_A = '11111111-1111-4111-a111-111111111111'
const CUSTOMER_B = '22222222-2222-4222-a222-222222222222'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

// Mutable principals the middleware mocks hand out.
let apiKeyPrincipal: Record<string, unknown>
let jwtPrincipal: Record<string, unknown>

const mockPrisma = prisma as unknown as {
  sandbox: { findFirst: jest.Mock }
  $queryRaw: jest.Mock
}
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock
const mockRunHandler = runService.runHandler as jest.Mock

const SANDBOX_ROW = {
  id: SANDBOX_ID,
  customerId: CUSTOMER_A,
  name: 'crowdstrike-dev',
  appId: 'crowdstrike-edr',
  status: 'ACTIVE',
  createdById: null,
  lastSyncAt: null,
  fileCount: 3,
  sizeBytes: 100,
  expiresAt: new Date(Date.now() + 86400000),
  createdAt: new Date(),
  updatedAt: new Date(),
}

const RUN_RESPONSE = {
  runId: '99999999-9999-4999-a999-999999999999',
  handler: 'validate',
  configTypeId: 'policies',
  ok: true,
  result: { valid: true, errors: [], custom: { nested: 1 } },
  error: null,
  timedOut: false,
  durationMs: 123,
  logs: [{ level: 'log', line: 'validating' }],
}

describe('POST /api/sandboxes/:id/run', () => {
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
      apiKeyScopes: ['sandbox:write'],
    }
    jwtPrincipal = {
      id: 'user-1',
      customerId: CUSTOMER_A,
      roleId: 'role-1',
    }
    // Tenancy-respecting sandbox lookup (like the real prisma query).
    mockPrisma.sandbox.findFirst.mockImplementation(async ({ where }: { where: { id: string; customerId: string } }) =>
      where.id === SANDBOX_ID && where.customerId === CUSTOMER_A ? SANDBOX_ROW : null,
    )
    mockRunHandler.mockResolvedValue(RUN_RESPONSE)
  })

  function inject(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: `/api/sandboxes/${SANDBOX_ID}/run`,
      headers: { authorization: 'ApiKey test-key' },
      payload: { configTypeId: 'policies', handler: 'validate' },
      ...overrides,
    })
  }

  it('is invisible (404) while the SANDBOX_ENABLED flag is off', async () => {
    mockIsFeatureEnabled.mockReturnValue(false)

    const response = await inject()

    expect(response.statusCode).toBe(404)
    expect(mockRunHandler).not.toHaveBeenCalled()
  })

  it('rejects API keys without the sandbox:write scope', async () => {
    apiKeyPrincipal.apiKeyScopes = ['sandbox:read']

    const response = await inject()

    expect(response.statusCode).toBe(403)
    expect(response.json().error).toContain('sandbox:write')
    expect(mockRunHandler).not.toHaveBeenCalled()
  })

  it('runs the handler for a properly scoped API key and serializes every field', async () => {
    const response = await inject({
      payload: {
        configTypeId: 'policies',
        handler: 'validate',
        canvas: { name: 'draft', sections: [{ name: 'general', fields: { a: 1 } }] },
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toEqual({
      runId: RUN_RESPONSE.runId,
      handler: 'validate',
      configTypeId: 'policies',
      ok: true,
      result: { valid: true, errors: [], custom: { nested: 1 } }, // arbitrary handler JSON survives
      error: null,
      timedOut: false,
      durationMs: 123,
      logs: [{ level: 'log', line: 'validating' }],
    })

    // Sandbox row was resolved tenant-scoped and passed to the service,
    // with a null actor (API keys have no user row).
    expect(mockRunHandler).toHaveBeenCalledWith(
      SANDBOX_ROW,
      expect.objectContaining({ configTypeId: 'policies', handler: 'validate' }),
      null,
    )
  })

  it('rejects deploy/rollback at the schema level', async () => {
    for (const handler of ['deploy', 'rollback']) {
      const response = await inject({ payload: { configTypeId: 'policies', handler } })
      expect(response.statusCode).toBe(400)
    }
    expect(mockRunHandler).not.toHaveBeenCalled()
  })

  it('404s when another tenant targets the sandbox (invisible across tenants)', async () => {
    apiKeyPrincipal.customerId = CUSTOMER_B

    const response = await inject()

    expect(response.statusCode).toBe(404)
    expect(mockRunHandler).not.toHaveBeenCalled()
  })

  it('JWT callers need the sandbox:manage RBAC permission', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]) // no permissions

    const denied = await inject({
      headers: { authorization: 'Bearer some-jwt', 'x-role-id': 'role-1' },
    })
    expect(denied.statusCode).toBe(403)

    mockPrisma.$queryRaw.mockResolvedValue([{ resource: 'sandbox', action: 'manage' }])
    const allowed = await inject({
      headers: { authorization: 'Bearer some-jwt', 'x-role-id': 'role-1' },
    })
    expect(allowed.statusCode).toBe(200)
    // JWT actor id is forwarded for audit attribution.
    expect(mockRunHandler).toHaveBeenCalledWith(SANDBOX_ROW, expect.anything(), 'user-1')
  })

  it('JWT callers without a role header are rejected', async () => {
    const response = await inject({ headers: { authorization: 'Bearer some-jwt' } })
    expect(response.statusCode).toBe(401)
  })
})

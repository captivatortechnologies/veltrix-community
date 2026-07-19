// ========================================================================
// Sandbox Detail-View Route Tests (S5 UI)
//
// Boots a real Fastify instance with the sandbox routes and mocked auth
// middlewares / db / sync service. Covers:
//   - GET /:id: manifest summary attached (or null when never synced)
//   - GET /:id/files: pagination wiring, auth, feature-flag gating, tenancy
// Deeper logic (listFiles/getManifestSummary correctness, path-escape
// safety) is unit-tested directly in sync.service.test.ts; this file only
// verifies the HTTP layer wires request -> service -> response correctly.
// ========================================================================

import fastify, { type FastifyInstance } from 'fastify'
import prisma from '../../../db'
import { isFeatureEnabled } from '../../../config/feature-flags'
import { sandboxRoutes } from '../sandbox.route'

jest.mock('../../../config/feature-flags', () => ({
  isFeatureEnabled: jest.fn(),
}))

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

// listFiles/getManifestSummary logic is covered directly in
// sync.service.test.ts; here we only need to verify the route wires the
// query/response through, so both are mocked.
jest.mock('../sync.service', () => ({
  __esModule: true,
  syncService: {},
  listFiles: jest.fn(),
  getManifestSummary: jest.fn(),
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listFiles: mockListFiles, getManifestSummary: mockGetManifestSummary } = jest.requireMock(
  '../sync.service',
) as { listFiles: jest.Mock; getManifestSummary: jest.Mock }

const CUSTOMER_A = '11111111-1111-4111-a111-111111111111'
const CUSTOMER_B = '22222222-2222-4222-a222-222222222222'
const SANDBOX_ID = '33333333-3333-4333-a333-333333333333'

let apiKeyPrincipal: Record<string, unknown>
let jwtPrincipal: Record<string, unknown>

const mockPrisma = prisma as unknown as {
  sandbox: { findFirst: jest.Mock }
  $queryRaw: jest.Mock
}
const mockIsFeatureEnabled = isFeatureEnabled as jest.Mock

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

const MANIFEST_SUMMARY = {
  appId: 'splunk-enterprise',
  name: 'Splunk Enterprise',
  version: '1.1.0',
  configTypes: [{ id: 'indexes', name: 'Indexes', handlers: ['validate', 'getStatus'] }],
  valid: true,
  errors: [],
  warnings: [],
  transpiledCount: 22,
}

const FILES_PAGE = {
  files: [{ path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 100 }],
  totalCount: 38,
  totalBytes: 177063,
  limit: 500,
  offset: 0,
}

describe('Sandbox detail-view routes', () => {
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
      id: 'api-key-user',
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
    mockGetManifestSummary.mockResolvedValue(MANIFEST_SUMMARY)
    mockListFiles.mockReturnValue(FILES_PAGE)
  })

  // -------------------------------------------------------------------
  // GET /:id
  // -------------------------------------------------------------------
  describe('GET /:id', () => {
    function inject(overrides: Record<string, unknown> = {}) {
      return app.inject({
        method: 'GET',
        url: `/api/sandboxes/${SANDBOX_ID}`,
        headers: { authorization: 'ApiKey test-key' },
        ...overrides,
      })
    }

    it('is invisible (404) while SANDBOX_ENABLED is off', async () => {
      mockIsFeatureEnabled.mockReturnValue(false)
      const response = await inject()
      expect(response.statusCode).toBe(404)
    })

    it('attaches the manifest summary to the sandbox response', async () => {
      const response = await inject()

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(SANDBOX_ID)
      expect(body.manifest).toEqual(MANIFEST_SUMMARY)
      expect(mockGetManifestSummary).toHaveBeenCalledWith(SANDBOX_ROW)
    })

    it('returns manifest: null for a sandbox that has never synced', async () => {
      mockGetManifestSummary.mockResolvedValue(null)

      const response = await inject()

      expect(response.statusCode).toBe(200)
      expect(response.json().manifest).toBeNull()
    })

    it('404s across tenants without ever calling getManifestSummary', async () => {
      apiKeyPrincipal.customerId = CUSTOMER_B

      const response = await inject()

      expect(response.statusCode).toBe(404)
      expect(mockGetManifestSummary).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------
  // GET /:id/files
  // -------------------------------------------------------------------
  describe('GET /:id/files', () => {
    function inject(overrides: Record<string, unknown> = {}) {
      return app.inject({
        method: 'GET',
        url: `/api/sandboxes/${SANDBOX_ID}/files`,
        headers: { authorization: 'ApiKey test-key' },
        ...overrides,
      })
    }

    it('is invisible (404) while SANDBOX_ENABLED is off', async () => {
      mockIsFeatureEnabled.mockReturnValue(false)
      const response = await inject()
      expect(response.statusCode).toBe(404)
      expect(mockListFiles).not.toHaveBeenCalled()
    })

    it('rejects API keys without the sandbox:read scope', async () => {
      apiKeyPrincipal.apiKeyScopes = []
      const response = await inject()
      expect(response.statusCode).toBe(403)
      expect(mockListFiles).not.toHaveBeenCalled()
    })

    it('applies default pagination and returns the file page', async () => {
      const response = await inject()

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(FILES_PAGE)
      expect(mockListFiles).toHaveBeenCalledWith(SANDBOX_ROW, { limit: 500, offset: 0 })
    })

    it('forwards explicit limit/offset query params', async () => {
      const response = await inject({ url: `/api/sandboxes/${SANDBOX_ID}/files?limit=10&offset=20` })

      expect(response.statusCode).toBe(200)
      expect(mockListFiles).toHaveBeenCalledWith(SANDBOX_ROW, { limit: 10, offset: 20 })
    })

    it('rejects a limit above the allowed maximum at the schema level', async () => {
      const response = await inject({ url: `/api/sandboxes/${SANDBOX_ID}/files?limit=5000` })
      expect(response.statusCode).toBe(400)
      expect(mockListFiles).not.toHaveBeenCalled()
    })

    it('404s when another tenant targets the sandbox (invisible across tenants)', async () => {
      apiKeyPrincipal.customerId = CUSTOMER_B

      const response = await inject()

      expect(response.statusCode).toBe(404)
      expect(mockListFiles).not.toHaveBeenCalled()
    })

    it('JWT callers need the sandbox:manage RBAC permission', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([])

      const denied = await inject({
        headers: { authorization: 'Bearer some-jwt', 'x-role-id': 'role-1' },
      })
      expect(denied.statusCode).toBe(403)

      mockPrisma.$queryRaw.mockResolvedValue([{ resource: 'sandbox', action: 'manage' }])
      const allowed = await inject({
        headers: { authorization: 'Bearer some-jwt', 'x-role-id': 'role-1' },
      })
      expect(allowed.statusCode).toBe(200)
    })
  })
})

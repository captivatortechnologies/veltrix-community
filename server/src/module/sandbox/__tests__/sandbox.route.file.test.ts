// ========================================================================
// Sandbox File Route Tests (S6.2) — auth + feature-flag + tenancy + mapping
//
// Boots a real Fastify instance with the sandbox routes and mocked auth
// middlewares / db / file service. Verifies the HTTP layer wires GET/PUT/DELETE
// …/file correctly:
//   - SANDBOX_ENABLED off -> 404 for the whole module
//   - API-key scopes: read for GET, write for PUT/DELETE
//   - cross-tenant sandbox id is a 404 (invisible) for every verb
//   - service errors map to their status codes (409 stale, 413 caps)
//   - origin ('cli' for API keys) + originClientId are threaded to the service
// File-system/hardening logic is covered directly in file.service.test.ts.
// ========================================================================

import fastify, { type FastifyInstance } from 'fastify'
import prisma from '../../../db'
import { isFeatureEnabled } from '../../../config/feature-flags'
import { fileService } from '../file.service'
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

// Keep the module light: the file/sync/run services are not the unit under test.
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
const mockReadFile = fileService.readFile as jest.Mock
const mockWriteFile = fileService.writeFile as jest.Mock
const mockDeleteFile = fileService.deleteFile as jest.Mock

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

const VALIDATION = { valid: true, errors: [], warnings: [], manifest: null, transpiledCount: 22 }
const FILE_CONTENT = {
  path: 'config-types/indexes/validate.ts',
  sha256: 'a'.repeat(64),
  size: 10683,
  content: '// validate\n',
  encoding: 'utf8',
  truncated: false,
}

describe('Sandbox file routes', () => {
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
    jwtPrincipal = { id: 'user-1', customerId: CUSTOMER_A, roleId: 'role-1' }
    mockPrisma.sandbox.findFirst.mockImplementation(
      async ({ where }: { where: { id: string; customerId: string } }) =>
        where.id === SANDBOX_ID && where.customerId === CUSTOMER_A ? SANDBOX_ROW : null,
    )
    mockReadFile.mockReturnValue(FILE_CONTENT)
    mockWriteFile.mockResolvedValue({ sha256: 'b'.repeat(64), size: 12, validation: VALIDATION })
    mockDeleteFile.mockResolvedValue({ path: FILE_CONTENT.path, deleted: true, validation: VALIDATION })
  })

  // -----------------------------------------------------------------------
  // GET /:id/file
  // -----------------------------------------------------------------------
  describe('GET /:id/file', () => {
    function inject(overrides: Record<string, unknown> = {}) {
      return app.inject({
        method: 'GET',
        url: `/api/sandboxes/${SANDBOX_ID}/file?path=config-types/indexes/validate.ts`,
        headers: { authorization: 'ApiKey k' },
        ...overrides,
      })
    }

    it('is invisible (404) while SANDBOX_ENABLED is off', async () => {
      mockIsFeatureEnabled.mockReturnValue(false)
      expect((await inject()).statusCode).toBe(404)
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('returns the file content and forwards the path', async () => {
      const res = await inject()
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(FILE_CONTENT)
      expect(mockReadFile).toHaveBeenCalledWith(SANDBOX_ROW, 'config-types/indexes/validate.ts')
    })

    it('requires the path query param (400 at schema level)', async () => {
      const res = await inject({ url: `/api/sandboxes/${SANDBOX_ID}/file` })
      expect(res.statusCode).toBe(400)
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('accepts API keys with only sandbox:read', async () => {
      apiKeyPrincipal.apiKeyScopes = ['sandbox:read']
      expect((await inject()).statusCode).toBe(200)
    })

    it('404s across tenants without reading anything', async () => {
      apiKeyPrincipal.customerId = CUSTOMER_B
      const res = await inject()
      expect(res.statusCode).toBe(404)
      expect(mockReadFile).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // PUT /:id/file
  // -----------------------------------------------------------------------
  describe('PUT /:id/file', () => {
    const body = { path: 'config-types/indexes/validate.ts', content: '// edit\n', encoding: 'utf8' }

    function inject(overrides: Record<string, unknown> = {}) {
      return app.inject({
        method: 'PUT',
        url: `/api/sandboxes/${SANDBOX_ID}/file`,
        headers: { authorization: 'ApiKey k' },
        payload: body,
        ...overrides,
      })
    }

    it('rejects API keys without sandbox:write', async () => {
      apiKeyPrincipal.apiKeyScopes = ['sandbox:read']
      const res = await inject()
      expect(res.statusCode).toBe(403)
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('writes the file and threads origin=cli + originClientId to the service', async () => {
      const res = await inject({
        payload: { ...body, originClientId: 'cli-42' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ sha256: 'b'.repeat(64), size: 12, validation: VALIDATION })
      expect(mockWriteFile).toHaveBeenCalledWith(
        SANDBOX_ROW,
        expect.objectContaining({ path: body.path, content: body.content, encoding: 'utf8' }),
        { origin: 'cli', originClientId: 'cli-42' }, // API key => cli
      )
    })

    it('stamps origin=portal for JWT callers', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ resource: 'sandbox', action: 'manage' }])
      const res = await inject({
        headers: { authorization: 'Bearer jwt', 'x-role-id': 'role-1' },
      })
      expect(res.statusCode).toBe(200)
      expect(mockWriteFile).toHaveBeenCalledWith(
        SANDBOX_ROW,
        expect.anything(),
        expect.objectContaining({ origin: 'portal' }),
      )
    })

    it('maps a stale-hash 409 from the service', async () => {
      mockWriteFile.mockRejectedValue(new SandboxError('expectedSha256 mismatch', 409))
      expect((await inject()).statusCode).toBe(409)
    })

    it('maps a cap 413 from the service', async () => {
      mockWriteFile.mockRejectedValue(new SandboxError('too big', 413))
      expect((await inject()).statusCode).toBe(413)
    })

    it('rejects an invalid encoding at the schema level', async () => {
      const res = await inject({ payload: { ...body, encoding: 'hex' } })
      expect(res.statusCode).toBe(400)
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('404s across tenants without writing anything', async () => {
      apiKeyPrincipal.customerId = CUSTOMER_B
      expect((await inject()).statusCode).toBe(404)
      expect(mockWriteFile).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // DELETE /:id/file
  // -----------------------------------------------------------------------
  describe('DELETE /:id/file', () => {
    function inject(overrides: Record<string, unknown> = {}) {
      return app.inject({
        method: 'DELETE',
        url: `/api/sandboxes/${SANDBOX_ID}/file?path=config-types/indexes/validate.ts`,
        headers: { authorization: 'ApiKey k' },
        ...overrides,
      })
    }

    it('rejects API keys without sandbox:write', async () => {
      apiKeyPrincipal.apiKeyScopes = ['sandbox:read']
      expect((await inject()).statusCode).toBe(403)
      expect(mockDeleteFile).not.toHaveBeenCalled()
    })

    it('deletes the file and forwards path + originClientId', async () => {
      const res = await inject({
        url: `/api/sandboxes/${SANDBOX_ID}/file?path=config-types/indexes/validate.ts&originClientId=cli-9`,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ path: FILE_CONTENT.path, deleted: true, validation: VALIDATION })
      expect(mockDeleteFile).toHaveBeenCalledWith(SANDBOX_ROW, 'config-types/indexes/validate.ts', {
        origin: 'cli',
        originClientId: 'cli-9',
      })
    })

    it('404s across tenants without deleting anything', async () => {
      apiKeyPrincipal.customerId = CUSTOMER_B
      expect((await inject()).statusCode).toBe(404)
      expect(mockDeleteFile).not.toHaveBeenCalled()
    })
  })
})

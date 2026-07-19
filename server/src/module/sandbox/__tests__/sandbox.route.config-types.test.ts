// ========================================================================
// Sandbox Config-Type Route Tests — auth + feature-flag + tenancy + schema
//
// Boots a real Fastify instance with the sandbox routes and mocked auth /
// db / services. Verifies POST /:id/config-types at the HTTP layer:
//   - SANDBOX_ENABLED off -> 404 for the whole module
//   - requires the sandbox:write scope
//   - the slug body schema rejects a bad id (400) before the service runs
//   - cross-tenant sandbox id is a 404 (invisible)
//   - service errors map to their status codes (409 duplicate)
//   - origin ('cli' for API keys) + originClientId are threaded to the service
//   - the response carries the refreshed manifest summary
// Scaffolding/file-system logic is covered in config-type-scaffold.test.ts.
// ========================================================================

import fastify, { type FastifyInstance } from 'fastify'
import prisma from '../../../db'
import { isFeatureEnabled } from '../../../config/feature-flags'
import { configTypeScaffold } from '../config-type-scaffold'
import { getManifestSummary } from '../sync.service'
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

jest.mock('../config-type-scaffold', () => ({
  configTypeScaffold: { addConfigType: jest.fn() },
}))
jest.mock('../sync.service', () => ({
  __esModule: true,
  syncService: {},
  listFiles: jest.fn(),
  getManifestSummary: jest.fn(),
}))
jest.mock('../file.service', () => ({
  fileService: { readFile: jest.fn(), writeFile: jest.fn(), deleteFile: jest.fn() },
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
const mockAddConfigType = configTypeScaffold.addConfigType as jest.Mock
const mockManifestSummary = getManifestSummary as jest.Mock

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

const CREATED_PATHS = [
  'config-types/detections/canvas.yaml',
  'config-types/detections/defaults.yaml',
  'config-types/detections/validate.ts',
  'config-types/detections/deploy.ts',
  'config-types/detections/rollback.ts',
  'config-types/detections/healthCheck.ts',
  'config-types/detections/driftDetect.ts',
  'config-types/detections/getStatus.ts',
  'manifest.yaml',
]

const MANIFEST_SUMMARY = {
  appId: 'splunk-enterprise',
  name: 'Splunk Enterprise',
  version: '1.1.1',
  configTypes: [{ id: 'detections', name: 'Detections', handlers: ['validate', 'deploy'] }],
  client: null,
  valid: true,
  errors: [],
  warnings: [],
  transpiledCount: 24,
}

describe('POST /:id/config-types', () => {
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
    mockAddConfigType.mockResolvedValue({
      configTypeId: 'detections',
      createdPaths: CREATED_PATHS,
      validation: { valid: true, errors: [], warnings: [], manifest: null, transpiledCount: 24 },
    })
    mockManifestSummary.mockResolvedValue(MANIFEST_SUMMARY)
  })

  const body = { id: 'detections', name: 'Detections', componentTypes: ['server'] }

  function inject(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: `/api/sandboxes/${SANDBOX_ID}/config-types`,
      headers: { authorization: 'ApiKey k' },
      payload: body,
      ...overrides,
    })
  }

  it('is invisible (404) while SANDBOX_ENABLED is off', async () => {
    mockIsFeatureEnabled.mockReturnValue(false)
    expect((await inject()).statusCode).toBe(404)
    expect(mockAddConfigType).not.toHaveBeenCalled()
  })

  it('rejects API keys without sandbox:write', async () => {
    apiKeyPrincipal.apiKeyScopes = ['sandbox:read']
    const res = await inject()
    expect(res.statusCode).toBe(403)
    expect(mockAddConfigType).not.toHaveBeenCalled()
  })

  it('scaffolds the config type and returns the refreshed manifest', async () => {
    const res = await inject({ payload: { ...body, originClientId: 'cli-42' } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      configTypeId: 'detections',
      createdPaths: CREATED_PATHS,
      manifest: { ...MANIFEST_SUMMARY, version: '1.1.1' },
    })
    expect(mockAddConfigType).toHaveBeenCalledWith(
      SANDBOX_ROW,
      expect.objectContaining({ id: 'detections', name: 'Detections', componentTypes: ['server'] }),
      { origin: 'cli', originClientId: 'cli-42' }, // API key => cli
    )
  })

  it('rejects an invalid slug id at the schema level (400) before the service runs', async () => {
    const res = await inject({ payload: { id: 'Bad Id' } })
    expect(res.statusCode).toBe(400)
    expect(mockAddConfigType).not.toHaveBeenCalled()
  })

  it('requires the id field (400)', async () => {
    const res = await inject({ payload: { name: 'No id' } })
    expect(res.statusCode).toBe(400)
    expect(mockAddConfigType).not.toHaveBeenCalled()
  })

  it('404s across tenants without scaffolding anything', async () => {
    apiKeyPrincipal.customerId = CUSTOMER_B
    const res = await inject()
    expect(res.statusCode).toBe(404)
    expect(mockAddConfigType).not.toHaveBeenCalled()
  })

  it('maps a duplicate-id SandboxError to its 409 status', async () => {
    mockAddConfigType.mockRejectedValue(new SandboxError('Configuration type "detections" already exists', 409))
    const res = await inject()
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/already exists/)
  })
})

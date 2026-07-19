// ========================================================================
// Tests: AppRegistry app -> Tool link
//
// Verifies the additive behaviour that represents each app as a legacy Tool:
//   - install() upserts a Tool named after the app (keyed by Tool.name) with
//     the app's description/vendor/category, without disturbing the existing
//     App / permission / setting / configuration-type upserts.
//   - enable() links the app's Tool to the customer via CustomerTool.
//   - a Tool upsert failure never blocks install.
//
// Prisma is fully mocked; the manifest parser is mocked so install() operates
// on a fixed in-memory manifest (no disk / no handler requires beyond the
// guarded server-entry load).
// ========================================================================

import type { AppManifest } from '../../../../shared/types/app'

jest.mock('../manifest-parser', () => ({
  discoverManifests: jest.fn(() => []),
  parseManifest: jest.fn(),
}))

import { AppRegistry } from '../app-registry'
import { parseManifest } from '../manifest-parser'

const mockParseManifest = parseManifest as jest.Mock

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildManifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: 'crowdstrike-edr',
    name: 'CrowdStrike EDR',
    version: '1.0.0',
    vendor: 'CrowdStrike',
    description: 'CrowdStrike Falcon EDR integration',
    category: 'EDR',
    platform: { minVersion: '1.0.0' },
    permissions: { platform: [], app: [] },
    pipeline: { configurationTypes: [] },
    server: { entry: './server/does-not-exist.js' },
    ...overrides,
  } as AppManifest
}

function buildMockDb() {
  return {
    app: {
      upsert: jest.fn().mockResolvedValue({ id: 'app-uuid-1', name: 'CrowdStrike EDR', version: '1.0.0' }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'app-uuid-1', appId: 'crowdstrike-edr', name: 'CrowdStrike EDR', version: '1.0.0' }),
      findUnique: jest.fn(),
    },
    appPermissionDefinition: { upsert: jest.fn().mockResolvedValue({}) },
    appSettingDefinition: { upsert: jest.fn().mockResolvedValue({}) },
    appConfigurationType: { upsert: jest.fn().mockResolvedValue({}) },
    appInstallation: { upsert: jest.fn().mockResolvedValue({}) },
    tool: {
      upsert: jest.fn().mockResolvedValue({ id: 'tool-uuid-1', name: 'CrowdStrike EDR' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'tool-uuid-1', name: 'CrowdStrike EDR' }),
    },
    customerTool: { upsert: jest.fn().mockResolvedValue({}) },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppRegistry app -> Tool link', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Silence the guarded server-entry require failure log.
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('install()', () => {
    it('upserts a Tool named after the app with its vendor/category/description', async () => {
      const db = buildMockDb()
      mockParseManifest.mockReturnValue(buildManifest())

      const registry = new AppRegistry(db as any, '/fake/apps')
      await registry.install('crowdstrike-edr')

      expect(db.tool.upsert).toHaveBeenCalledTimes(1)
      expect(db.tool.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'CrowdStrike EDR' },
          create: expect.objectContaining({
            name: 'CrowdStrike EDR',
            description: 'CrowdStrike Falcon EDR integration',
            vendor: 'CrowdStrike',
            category: 'EDR',
          }),
          update: expect.objectContaining({
            vendor: 'CrowdStrike',
            category: 'EDR',
            isActive: true,
          }),
        }),
      )
    })

    it('still upserts the App record (Tool link is additive)', async () => {
      const db = buildMockDb()
      mockParseManifest.mockReturnValue(buildManifest())

      const registry = new AppRegistry(db as any, '/fake/apps')
      await registry.install('crowdstrike-edr')

      expect(db.app.upsert).toHaveBeenCalledTimes(1)
    })

    it('falls back to sensible defaults when vendor/category are absent', async () => {
      const db = buildMockDb()
      mockParseManifest.mockReturnValue(
        buildManifest({ vendor: undefined as any, category: undefined as any, description: undefined as any }),
      )

      const registry = new AppRegistry(db as any, '/fake/apps')
      await registry.install('crowdstrike-edr')

      expect(db.tool.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            name: 'CrowdStrike EDR',
            description: 'CrowdStrike EDR',
            vendor: 'Veltrix',
            category: 'CUSTOM',
          }),
        }),
      )
    })

    it('does not block install when the Tool upsert fails', async () => {
      const db = buildMockDb()
      db.tool.upsert.mockRejectedValue(new Error('db down'))
      mockParseManifest.mockReturnValue(buildManifest())

      const registry = new AppRegistry(db as any, '/fake/apps')

      await expect(registry.install('crowdstrike-edr')).resolves.toBeUndefined()
      // App upsert still ran despite the Tool failure.
      expect(db.app.upsert).toHaveBeenCalledTimes(1)
    })
  })

  describe('enable()', () => {
    it('links the app Tool to the customer via CustomerTool', async () => {
      const db = buildMockDb()

      const registry = new AppRegistry(db as any, '/fake/apps')
      await registry.enable('crowdstrike-edr', 'cust-1', 'user-1')

      expect(db.tool.findUnique).toHaveBeenCalledWith({ where: { name: 'CrowdStrike EDR' } })
      expect(db.customerTool.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId_toolId: { customerId: 'cust-1', toolId: 'tool-uuid-1' } },
          create: { customerId: 'cust-1', toolId: 'tool-uuid-1' },
        }),
      )
    })

    it('does not block enable when no Tool exists for the app yet', async () => {
      const db = buildMockDb()
      db.tool.findUnique.mockResolvedValue(null)

      const registry = new AppRegistry(db as any, '/fake/apps')

      await expect(registry.enable('crowdstrike-edr', 'cust-1', 'user-1')).resolves.toBeUndefined()
      expect(db.customerTool.upsert).not.toHaveBeenCalled()
      expect(db.appInstallation.upsert).toHaveBeenCalledTimes(1)
    })
  })
})

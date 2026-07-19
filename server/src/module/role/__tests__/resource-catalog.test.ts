// ========================================================================
// Tests: resource-catalog — the live role catalog (R4, RBAC/IdP hardening
// 2026-07-10). Replaces the old hardcoded 9-resource placeholder with the
// resources actually enforced platform-wide plus each installed app's
// declared AppPermissionDefinitions and configuration types.
// ========================================================================

import prisma from '../../../db'
import { getResourceCatalog, getResourceActions, PLATFORM_RESOURCE_CATALOG } from '../resource-catalog'

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    appInstallation: { findMany: jest.fn() },
  },
}))

const mockFindMany = prisma.appInstallation.findMany as jest.Mock

const CUSTOMER_ID = 'cust-1'

beforeEach(() => jest.clearAllMocks())

describe('PLATFORM_RESOURCE_CATALOG', () => {
  it('every entry matches a real hasPermission() resource name used in the codebase', () => {
    // Spot-check the resources this wave actually gates (R0-R6). A full
    // codebase grep-diff is impractical in a unit test, but every name here
    // must correspond to a hasPermission('<resource>', ...) call site —
    // this list is the single documented source of truth for that mapping.
    const names = PLATFORM_RESOURCE_CATALOG.map((e) => e.resource)
    for (const expected of [
      'role', 'user', 'apps', 'component', 'configuration-canvas', 'customer',
      'credential', 'tag', 'tool', 'logForwarding', 'connectivity',
      'tailscale', 'apiKey', 'payment', 'subscription', 'organization', 'logEntry',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('has no duplicate platform resource names', () => {
    const names = PLATFORM_RESOURCE_CATALOG.map((e) => e.resource)
    expect(new Set(names).size).toBe(names.length)
  })

  it('drifted names are gone from the canon (tools, tool:list)', () => {
    const names = PLATFORM_RESOURCE_CATALOG.map((e) => e.resource)
    expect(names).not.toContain('tools')
    const toolEntry = PLATFORM_RESOURCE_CATALOG.find((e) => e.resource === 'tool')
    expect(toolEntry?.actions).not.toContain('list')
  })
})

describe('getResourceCatalog', () => {
  it('returns every platform resource, appId null, when the customer has no installed apps', async () => {
    mockFindMany.mockResolvedValue([])
    const catalog = await getResourceCatalog(CUSTOMER_ID)
    expect(catalog.length).toBe(PLATFORM_RESOURCE_CATALOG.length)
    expect(catalog.every((e) => e.appId === null)).toBe(true)
  })

  it('appends an installed app\'s declared permissions, grouped by resource with appId set', async () => {
    mockFindMany.mockResolvedValue([
      {
        appId: 'app-uuid-1',
        app: {
          id: 'app-uuid-1',
          name: 'Splunk Enterprise',
          permissions: [
            { resource: 'indexes', action: 'read', description: 'Read indexes' },
            { resource: 'indexes', action: 'write', description: null },
            { resource: 'roles', action: 'read', description: null },
          ],
          configTypes: [],
        },
      },
    ])

    const catalog = await getResourceCatalog(CUSTOMER_ID)
    const appEntries = catalog.filter((e) => e.appId === 'app-uuid-1')

    expect(appEntries).toHaveLength(2)
    const indexes = appEntries.find((e) => e.resource === 'indexes')
    expect(indexes?.actions.sort()).toEqual(['read', 'write'])
    expect(indexes?.appName).toBe('Splunk Enterprise')
    expect(indexes?.description).toBe('Read indexes')
  })

  it('appends configuration types as resource = configTypeId with action [read] (design decision 1)', async () => {
    mockFindMany.mockResolvedValue([
      {
        appId: 'app-uuid-1',
        app: {
          id: 'app-uuid-1',
          name: 'Splunk Enterprise',
          permissions: [],
          configTypes: [
            { configTypeId: 'indexes', name: 'Index Configuration' },
            { configTypeId: 'roles', name: 'Role Configuration' },
          ],
        },
      },
    ])

    const catalog = await getResourceCatalog(CUSTOMER_ID)
    const appEntries = catalog.filter((e) => e.appId === 'app-uuid-1')

    expect(appEntries).toHaveLength(2)
    expect(appEntries.map((e) => e.resource).sort()).toEqual(['indexes', 'roles'])
    expect(appEntries.every((e) => e.actions.includes('read'))).toBe(true)
  })

  it('does not duplicate a configTypeId already covered by an explicit app permission declaration', async () => {
    mockFindMany.mockResolvedValue([
      {
        appId: 'app-uuid-1',
        app: {
          id: 'app-uuid-1',
          name: 'Splunk Enterprise',
          permissions: [{ resource: 'indexes', action: 'read', description: null }],
          configTypes: [{ configTypeId: 'indexes', name: 'Index Configuration' }],
        },
      },
    ])

    const catalog = await getResourceCatalog(CUSTOMER_ID)
    const appEntries = catalog.filter((e) => e.appId === 'app-uuid-1' && e.resource === 'indexes')
    expect(appEntries).toHaveLength(1) // not duplicated by the configType pass
  })

  it('only queries ENABLED installations', async () => {
    mockFindMany.mockResolvedValue([])
    await getResourceCatalog(CUSTOMER_ID)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: CUSTOMER_ID, enabled: true, status: 'ENABLED' },
      }),
    )
  })
})

describe('getResourceActions', () => {
  it('returns the platform actions for a known platform resource', async () => {
    mockFindMany.mockResolvedValue([])
    const actions = await getResourceActions('tool', CUSTOMER_ID)
    expect(actions).toEqual(['read', 'write'])
  })

  it('returns the app-scoped actions when appId is given and matches', async () => {
    mockFindMany.mockResolvedValue([
      {
        appId: 'app-uuid-1',
        app: {
          id: 'app-uuid-1',
          name: 'Splunk',
          permissions: [
            { resource: 'indexes', action: 'read', description: null },
            { resource: 'indexes', action: 'delete', description: null },
          ],
          configTypes: [],
        },
      },
    ])
    const actions = await getResourceActions('indexes', CUSTOMER_ID, 'app-uuid-1')
    expect(actions.sort()).toEqual(['delete', 'read'])
  })

  it('falls back to the generic CRUD set for a resource unknown to the catalog', async () => {
    mockFindMany.mockResolvedValue([])
    const actions = await getResourceActions('totally-unknown-resource', CUSTOMER_ID)
    expect(actions).toEqual(['read', 'create', 'update', 'delete'])
  })
})

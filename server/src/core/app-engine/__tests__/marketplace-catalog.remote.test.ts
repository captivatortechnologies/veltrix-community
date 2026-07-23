// ========================================================================
// Tests: remote catalog fetch (refreshMarketplaceCatalog)
//
// Separate file so Jest's per-file module isolation gives this suite its own
// fresh `liveCatalog` — the accessor tests in marketplace-catalog.test.ts keep
// seeing the offline fallback, uncontaminated by the live catalog set here.
// ========================================================================

import {
  marketplaceCatalog,
  refreshMarketplaceCatalog,
  __resetMarketplaceCatalogForTests,
} from '../marketplace-catalog'

// A minimal catalog.json payload with fields that exercise the mapper: coerced
// `available`, carried `sha256`/`sizeBytes`, and an INVALID entry (no version)
// that must be dropped. Deliberately excludes the fallback's `crowdstrike-edr`.
const REMOTE = {
  schemaVersion: 1,
  repository: 'https://github.com/acme/veltrix-apps',
  apps: [
    {
      appId: 'splunk-enterprise',
      name: 'Splunk Enterprise',
      version: '1.19.2',
      vendor: 'Veltrix',
      description: 'SIEM as code',
      category: 'SIEM',
      available: true,
      downloadUrl: 'https://example.test/splunk-enterprise.zip',
      sha256: 'abc123',
      sizeBytes: 442534,
    },
    {
      appId: 'okta-identity',
      name: 'Okta Identity',
      version: '1.10.0',
      vendor: 'Okta',
      description: 'IAM as code',
      category: 'IAM',
      available: true,
    },
    // Invalid — missing `version`; must be dropped by the mapper.
    { appId: 'broken', name: 'Broken' },
  ],
}

function mockFetch(impl: () => Promise<Partial<Response>>) {
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(impl as never)
}

const okJson = (body: unknown): Promise<Partial<Response>> =>
  Promise.resolve({ ok: true, status: 200, json: async () => body } as Partial<Response>)

beforeEach(() => {
  __resetMarketplaceCatalogForTests()
})

afterEach(() => {
  jest.restoreAllMocks()
  __resetMarketplaceCatalogForTests()
})

describe('refreshMarketplaceCatalog — success', () => {
  it('replaces the fallback with the mapped remote catalog', async () => {
    mockFetch(() => okJson(REMOTE))
    await refreshMarketplaceCatalog()

    const all = marketplaceCatalog.getAll()
    // The two valid entries load; the invalid third is dropped.
    expect(all).toHaveLength(2)
    expect(all.map((e) => e.appId).sort()).toEqual(['okta-identity', 'splunk-enterprise'])
    // The fallback-only app is gone — proves the live catalog took over.
    expect(marketplaceCatalog.getById('crowdstrike-edr')).toBeNull()
  })

  it('maps installability + integrity fields', async () => {
    mockFetch(() => okJson(REMOTE))
    await refreshMarketplaceCatalog()

    const splunk = marketplaceCatalog.getById('splunk-enterprise')
    expect(splunk?.available).toBe(true)
    expect(splunk?.downloadUrl).toBe('https://example.test/splunk-enterprise.zip')
    expect(splunk?.sha256).toBe('abc123')
    expect(splunk?.sizeBytes).toBe(442534)
    // sync accessors still work over the live catalog
    expect(marketplaceCatalog.getByCategory('iam').map((e) => e.appId)).toEqual(['okta-identity'])
    expect(marketplaceCatalog.search('splunk').map((e) => e.appId)).toEqual(['splunk-enterprise'])
  })
})

describe('refreshMarketplaceCatalog — resilience (keeps serving on failure)', () => {
  it('keeps the offline fallback on a non-200 response', async () => {
    mockFetch(() => Promise.resolve({ ok: false, status: 404 } as Partial<Response>))
    await refreshMarketplaceCatalog()
    // Fallback still served — the built-in crowdstrike-edr entry is present.
    expect(marketplaceCatalog.getById('crowdstrike-edr')).not.toBeNull()
  })

  it('keeps the offline fallback when the payload has no valid entries', async () => {
    mockFetch(() => okJson({ apps: [{ nope: true }] }))
    await refreshMarketplaceCatalog()
    expect(marketplaceCatalog.getById('crowdstrike-edr')).not.toBeNull()
  })

  it('keeps the offline fallback when fetch throws', async () => {
    mockFetch(() => Promise.reject(new Error('network down')))
    await refreshMarketplaceCatalog()
    expect(marketplaceCatalog.getById('crowdstrike-edr')).not.toBeNull()
  })

  it('keeps the last-good catalog when a later refresh fails', async () => {
    mockFetch(() => okJson(REMOTE))
    await refreshMarketplaceCatalog()
    expect(marketplaceCatalog.getById('splunk-enterprise')).not.toBeNull()

    mockFetch(() => Promise.reject(new Error('flaky')))
    await refreshMarketplaceCatalog()
    // Still the live catalog from the last success, not the fallback.
    expect(marketplaceCatalog.getById('splunk-enterprise')).not.toBeNull()
    expect(marketplaceCatalog.getById('crowdstrike-edr')).toBeNull()
  })
})

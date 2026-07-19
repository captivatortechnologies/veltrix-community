// ========================================================================
// Tests: marketplaceCatalog
//
// Covers all four public methods of the static catalog API:
//   - getAll()
//   - getById()
//   - search()
//   - getByCategory()
// ========================================================================

import { marketplaceCatalog, MarketplaceEntry } from '../marketplace-catalog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Required fields every catalog entry must carry. */
const REQUIRED_FIELDS: Array<keyof MarketplaceEntry> = [
  'appId',
  'name',
  'version',
  'vendor',
  'description',
  'category',
]

// Known-good entries used across multiple test blocks – keeps tests coupled
// to real data so they break loudly if the catalog changes unexpectedly.
const KNOWN_APP_ID = 'crowdstrike-edr'
const KNOWN_VENDOR = 'CrowdStrike'
const KNOWN_CATEGORY_UPPER = 'SIEM'
const KNOWN_CATEGORY_LOWER = 'siem'
const KNOWN_TAG = 'endpoint'
const NONSENSE_QUERY = 'xyzzy_no_match_123'

// ---------------------------------------------------------------------------
// getAll()
// ---------------------------------------------------------------------------

describe('marketplaceCatalog.getAll()', () => {
  let entries: MarketplaceEntry[]

  beforeEach(() => {
    entries = marketplaceCatalog.getAll()
  })

  it('returns an array', () => {
    expect(Array.isArray(entries)).toBe(true)
  })

  it('returns at least 5 entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(5)
  })

  it('every entry has all required fields', () => {
    entries.forEach((entry) => {
      REQUIRED_FIELDS.forEach((field) => {
        expect(entry).toHaveProperty(field)
        expect(entry[field]).toBeTruthy()
      })
    })
  })

  it('only splunk-enterprise is available; all other entries are placeholders', () => {
    entries.forEach((entry) => {
      if (entry.appId === 'splunk-enterprise') {
        expect(entry.available).toBe(true)
        expect(entry.downloadUrl).toBeTruthy()
      } else {
        expect(entry.available).toBe(false)
      }
    })
  })

  it('every appId is unique within the catalog', () => {
    const ids = entries.map((e) => e.appId)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('returns the same array reference on repeated calls (no copy)', () => {
    const second = marketplaceCatalog.getAll()
    expect(entries).toBe(second)
  })
})

// ---------------------------------------------------------------------------
// getById()
// ---------------------------------------------------------------------------

describe('marketplaceCatalog.getById()', () => {
  it('returns the correct entry for a known appId', () => {
    const entry = marketplaceCatalog.getById(KNOWN_APP_ID)

    expect(entry).not.toBeNull()
    expect(entry!.appId).toBe(KNOWN_APP_ID)
    expect(entry!.vendor).toBe(KNOWN_VENDOR)
  })

  it('returns an object that matches the full MarketplaceEntry shape', () => {
    const entry = marketplaceCatalog.getById(KNOWN_APP_ID)

    expect(entry).not.toBeNull()
    REQUIRED_FIELDS.forEach((field) => {
      expect(entry).toHaveProperty(field)
    })
    expect(typeof entry!.available).toBe('boolean')
  })

  it('returns null for an unknown appId', () => {
    expect(marketplaceCatalog.getById('does-not-exist')).toBeNull()
  })

  it('returns null for an empty string appId', () => {
    expect(marketplaceCatalog.getById('')).toBeNull()
  })

  it('is case-sensitive (appId slugs are lower-kebab-case)', () => {
    // 'CrowdStrike-EDR' is not the same as 'crowdstrike-edr'
    expect(marketplaceCatalog.getById('CrowdStrike-EDR')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe('marketplaceCatalog.search()', () => {
  describe('returns all entries', () => {
    const ALL_COUNT = marketplaceCatalog.getAll().length

    it('when the query is an empty string', () => {
      expect(marketplaceCatalog.search('')).toHaveLength(ALL_COUNT)
    })

    it('when the query contains only whitespace', () => {
      expect(marketplaceCatalog.search('   ')).toHaveLength(ALL_COUNT)
    })
  })

  describe('name matching', () => {
    it('returns entries whose name matches the query', () => {
      // 'CrowdStrike Falcon' contains 'Falcon'
      const results = marketplaceCatalog.search('Falcon')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((e) => e.appId === KNOWN_APP_ID)).toBe(true)
    })
  })

  describe('vendor matching', () => {
    it('returns entries whose vendor matches the query', () => {
      const results = marketplaceCatalog.search(KNOWN_VENDOR)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((e) => e.vendor === KNOWN_VENDOR)).toBe(true)
    })
  })

  describe('tag matching', () => {
    it('returns entries that carry the searched tag', () => {
      // 'endpoint' is a tag on crowdstrike-edr
      const results = marketplaceCatalog.search(KNOWN_TAG)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(
        results.some((e) => (e.tags ?? []).includes(KNOWN_TAG))
      ).toBe(true)
    })
  })

  describe('case-insensitivity', () => {
    it('matches name regardless of casing', () => {
      const lower = marketplaceCatalog.search('crowdstrike')
      const upper = marketplaceCatalog.search('CROWDSTRIKE')
      const mixed = marketplaceCatalog.search('CrOwDsTrIkE')

      expect(lower.length).toBeGreaterThanOrEqual(1)
      expect(lower.map((e) => e.appId)).toEqual(upper.map((e) => e.appId))
      expect(lower.map((e) => e.appId)).toEqual(mixed.map((e) => e.appId))
    })

    it('matches vendor regardless of casing', () => {
      const lower = marketplaceCatalog.search('elastic')
      const upper = marketplaceCatalog.search('ELASTIC')

      expect(lower.length).toBeGreaterThanOrEqual(1)
      expect(lower.map((e) => e.appId)).toEqual(upper.map((e) => e.appId))
    })

    it('matches tags regardless of casing', () => {
      // tag 'soar' exists; searching 'SOAR' should still find it
      const lower = marketplaceCatalog.search('soar')
      const upper = marketplaceCatalog.search('SOAR')

      expect(lower.length).toBeGreaterThanOrEqual(1)
      expect(lower.map((e) => e.appId)).toEqual(upper.map((e) => e.appId))
    })
  })

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace before matching', () => {
      const trimmed = marketplaceCatalog.search('Falcon')
      const padded = marketplaceCatalog.search('  Falcon  ')

      expect(padded.map((e) => e.appId)).toEqual(trimmed.map((e) => e.appId))
    })
  })

  describe('no-match scenarios', () => {
    it('returns an empty array for a nonsense query', () => {
      expect(marketplaceCatalog.search(NONSENSE_QUERY)).toHaveLength(0)
    })

    it('returns an empty array for a query that is purely whitespace after a nonsense suffix', () => {
      expect(marketplaceCatalog.search(`  ${NONSENSE_QUERY}  `)).toHaveLength(0)
    })
  })

  describe('description matching', () => {
    it('returns entries whose description contains the query term', () => {
      // 'petabyte' appears only in elastic-security description
      const results = marketplaceCatalog.search('petabyte')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((e) => e.appId === 'elastic-security')).toBe(true)
    })
  })

  describe('category matching', () => {
    it('returns entries whose category contains the query term', () => {
      const results = marketplaceCatalog.search('CLOUD')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.some((e) => e.category === 'CLOUD')).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// getByCategory()
// ---------------------------------------------------------------------------

describe('marketplaceCatalog.getByCategory()', () => {
  describe('returns matching entries', () => {
    it('returns all SIEM entries when queried with uppercase', () => {
      const results = marketplaceCatalog.getByCategory(KNOWN_CATEGORY_UPPER)
      expect(results.length).toBeGreaterThanOrEqual(1)
      results.forEach((e) => expect(e.category).toBe('SIEM'))
    })

    it('returns all IAM entries', () => {
      const results = marketplaceCatalog.getByCategory('IAM')
      expect(results.length).toBeGreaterThanOrEqual(1)
      results.forEach((e) => expect(e.category).toBe('IAM'))
    })
  })

  describe('case-insensitivity', () => {
    it('matches category with lowercase query', () => {
      const lower = marketplaceCatalog.getByCategory(KNOWN_CATEGORY_LOWER)
      const upper = marketplaceCatalog.getByCategory(KNOWN_CATEGORY_UPPER)

      expect(lower.length).toBeGreaterThanOrEqual(1)
      expect(lower.map((e) => e.appId)).toEqual(upper.map((e) => e.appId))
    })

    it('matches category with mixed-case query', () => {
      const mixed = marketplaceCatalog.getByCategory('SiEm')
      const upper = marketplaceCatalog.getByCategory(KNOWN_CATEGORY_UPPER)

      expect(mixed.map((e) => e.appId)).toEqual(upper.map((e) => e.appId))
    })
  })

  describe('whitespace trimming', () => {
    it('trims surrounding whitespace before matching', () => {
      const trimmed = marketplaceCatalog.getByCategory('EDR')
      const padded = marketplaceCatalog.getByCategory('  EDR  ')

      expect(padded.map((e) => e.appId)).toEqual(trimmed.map((e) => e.appId))
    })
  })

  describe('no-match scenarios', () => {
    it('returns an empty array for a non-existent category', () => {
      expect(marketplaceCatalog.getByCategory('NONEXISTENT')).toHaveLength(0)
    })

    it('returns an empty array for an empty string', () => {
      // '' trimmed and uppercased is '' – no category matches ''
      expect(marketplaceCatalog.getByCategory('')).toHaveLength(0)
    })

    it('returns an empty array for a whitespace-only string', () => {
      expect(marketplaceCatalog.getByCategory('   ')).toHaveLength(0)
    })
  })

  describe('result integrity', () => {
    it('every returned entry has the exact category value requested (normalised)', () => {
      const category = 'COMPLIANCE'
      const results = marketplaceCatalog.getByCategory(category)

      expect(results.length).toBeGreaterThanOrEqual(1)
      results.forEach((e) => {
        expect(e.category.toUpperCase()).toBe(category)
      })
    })

    it('does not return entries from other categories', () => {
      const edrResults = marketplaceCatalog.getByCategory('EDR')
      edrResults.forEach((e) => {
        expect(e.category).toBe('EDR')
      })
    })
  })
})

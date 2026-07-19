// ========================================================================
// Tests: app-version — the pure version-compare + release-resolution logic
// behind the per-tenant upgrade flow.
// ========================================================================

import {
  compareVersions,
  isUpgradeAvailable,
  resolveLatestRelease,
  buildAppVersionInfo,
} from '../app-version'

describe('compareVersions', () => {
  it('orders by numeric release segments', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1) // numeric, not lexical
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.16.2', '1.16.2')).toBe(0)
  })

  it('tolerates a leading v and missing segments', () => {
    expect(compareVersions('v1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBe(-1)
  })

  it('treats a prerelease as older than the same release', () => {
    expect(compareVersions('1.2.0-rc.1', '1.2.0')).toBe(-1)
    expect(compareVersions('1.2.0', '1.2.0-rc.1')).toBe(1)
    expect(compareVersions('1.2.0-alpha', '1.2.0-beta')).toBe(-1)
    expect(compareVersions('1.2.0-alpha.1', '1.2.0-alpha')).toBe(1)
  })

  it('ignores build metadata', () => {
    expect(compareVersions('1.2.0+build.5', '1.2.0')).toBe(0)
  })
})

describe('isUpgradeAvailable', () => {
  it('is true only when installed is strictly older', () => {
    expect(isUpgradeAvailable('1.0.0', '1.16.2')).toBe(true)
    expect(isUpgradeAvailable('1.16.2', '1.16.2')).toBe(false)
    expect(isUpgradeAvailable('2.0.0', '1.16.2')).toBe(false)
  })

  it('is false when nothing is installed', () => {
    expect(isUpgradeAvailable(null, '1.16.2')).toBe(false)
    expect(isUpgradeAvailable('', '1.16.2')).toBe(false)
    expect(isUpgradeAvailable(undefined, '1.16.2')).toBe(false)
  })
})

describe('resolveLatestRelease', () => {
  it('uses the catalog version + notes when the catalog is newer than on-disk', () => {
    const release = resolveLatestRelease('1.0.0', {
      version: '1.16.2',
      releaseNotes: '## Notes',
      releasedAt: '2026-07-15T00:00:00.000Z',
    })
    expect(release).toEqual({
      version: '1.16.2',
      releaseNotes: '## Notes',
      releasedAt: '2026-07-15T00:00:00.000Z',
    })
  })

  it('uses the catalog notes when the catalog equals on-disk', () => {
    const release = resolveLatestRelease('1.16.2', { version: '1.16.2', releaseNotes: 'N' })
    expect(release.version).toBe('1.16.2')
    expect(release.releaseNotes).toBe('N')
  })

  it('falls back to the on-disk version (no notes) when on-disk is ahead of the catalog', () => {
    const release = resolveLatestRelease('2.0.0', { version: '1.16.2', releaseNotes: 'N' })
    expect(release).toEqual({ version: '2.0.0' })
  })

  it('falls back to the on-disk version when there is no catalog entry', () => {
    expect(resolveLatestRelease('1.16.2', null)).toEqual({ version: '1.16.2' })
    expect(resolveLatestRelease('1.16.2', undefined)).toEqual({ version: '1.16.2' })
  })
})

describe('buildAppVersionInfo', () => {
  it('flags an available upgrade for a tenant behind the latest', () => {
    const info = buildAppVersionInfo({
      appId: 'splunk-enterprise',
      appVersion: '1.16.2',
      installedVersion: '1.0.0',
      catalogEntry: { version: '1.16.2', releaseNotes: 'notes here' },
    })
    expect(info).toEqual({
      appId: 'splunk-enterprise',
      installedVersion: '1.0.0',
      latestVersion: '1.16.2',
      upgradeAvailable: true,
      releaseNotes: 'notes here',
      releasedAt: undefined,
    })
  })

  it('reports no upgrade when the tenant is on the latest', () => {
    const info = buildAppVersionInfo({
      appId: 'splunk-enterprise',
      appVersion: '1.16.2',
      installedVersion: '1.16.2',
      catalogEntry: { version: '1.16.2' },
    })
    expect(info.upgradeAvailable).toBe(false)
    expect(info.latestVersion).toBe('1.16.2')
  })

  it('never reports an upgrade when nothing is installed', () => {
    const info = buildAppVersionInfo({
      appId: 'crowdstrike-edr',
      appVersion: '7.0.0',
      installedVersion: null,
      catalogEntry: { version: '7.0.0' },
    })
    expect(info.installedVersion).toBeNull()
    expect(info.upgradeAvailable).toBe(false)
  })
})

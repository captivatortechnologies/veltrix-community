// ========================================================================
// Tests: app-version — the pure version-compare + release-resolution logic
// behind the per-tenant upgrade flow.
// ========================================================================

import {
  compareVersions,
  isUpgradeAvailable,
  resolveLatestRelease,
  buildAppVersionInfo,
  extractChangelogSection,
} from '../app-version'

const CHANGELOG = [
  '# Changelog',
  '',
  '## 1.8.6 — 2026-07-21',
  '',
  '### Changed',
  '- Live pickers for the polymorphic fields.',
  '',
  '## 1.8.5 — 2026-07-21',
  '',
  '### Changed',
  '- Single-value pickers.',
].join('\n')

describe('extractChangelogSection', () => {
  it('returns the section for a version, up to the next heading', () => {
    const s = extractChangelogSection(CHANGELOG, '1.8.6')
    expect(s).toContain('## 1.8.6')
    expect(s).toContain('Live pickers for the polymorphic fields.')
    expect(s).not.toContain('1.8.5')
    expect(s).not.toContain('Single-value pickers.')
  })

  it('matches a v-prefixed version and the last section', () => {
    const s = extractChangelogSection(CHANGELOG, 'v1.8.5')
    expect(s).toContain('## 1.8.5')
    expect(s).toContain('Single-value pickers.')
  })

  it('returns undefined for a missing version or empty changelog', () => {
    expect(extractChangelogSection(CHANGELOG, '9.9.9')).toBeUndefined()
    expect(extractChangelogSection('', '1.8.6')).toBeUndefined()
  })
})

describe('buildAppVersionInfo — on-disk release notes fallback', () => {
  it('uses on-disk notes when the catalog placeholder carries none', () => {
    const info = buildAppVersionInfo({
      appId: 'okta-identity',
      appVersion: '1.8.6',
      installedVersion: '1.8.5',
      catalogEntry: { version: '4.0.0', releaseNotes: undefined }, // placeholder, no downloadUrl
      onDiskReleaseNotes: '## 1.8.6\n- notes',
    })
    expect(info.latestVersion).toBe('1.8.6')
    expect(info.upgradeAvailable).toBe(true)
    expect(info.releaseNotes).toBe('## 1.8.6\n- notes')
  })
})

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

// A downloadUrl marks a catalog entry as a genuinely installable release (vs a
// "coming soon" placeholder). Only installable entries drive the latest version.
const DL = 'https://example.com/releases/app.zip'

describe('resolveLatestRelease', () => {
  it('uses the catalog version + notes when the (installable) catalog is newer than on-disk', () => {
    const release = resolveLatestRelease('1.0.0', {
      version: '1.16.2',
      releaseNotes: '## Notes',
      releasedAt: '2026-07-15T00:00:00.000Z',
      downloadUrl: DL,
    })
    expect(release).toEqual({
      version: '1.16.2',
      releaseNotes: '## Notes',
      releasedAt: '2026-07-15T00:00:00.000Z',
    })
  })

  it('uses the catalog notes when the (installable) catalog equals on-disk', () => {
    const release = resolveLatestRelease('1.16.2', { version: '1.16.2', releaseNotes: 'N', downloadUrl: DL })
    expect(release.version).toBe('1.16.2')
    expect(release.releaseNotes).toBe('N')
  })

  it('falls back to the on-disk version (no notes) when on-disk is ahead of the catalog', () => {
    const release = resolveLatestRelease('2.0.0', { version: '1.16.2', releaseNotes: 'N', downloadUrl: DL })
    expect(release).toEqual({ version: '2.0.0' })
  })

  it('falls back to the on-disk version when there is no catalog entry', () => {
    expect(resolveLatestRelease('1.16.2', null)).toEqual({ version: '1.16.2' })
    expect(resolveLatestRelease('1.16.2', undefined)).toEqual({ version: '1.16.2' })
  })

  it('IGNORES a placeholder catalog entry with no downloadUrl (no phantom upgrade)', () => {
    // A marketplace placeholder declares the vendor product version 4.0.0 but
    // ships no package — it must not masquerade as an upgrade over the real
    // on-disk app version.
    const release = resolveLatestRelease('1.7.0', { version: '4.0.0', releaseNotes: 'vendor notes' })
    expect(release).toEqual({ version: '1.7.0' })
  })
})

describe('buildAppVersionInfo', () => {
  it('flags an available upgrade for a tenant behind the latest installable release', () => {
    const info = buildAppVersionInfo({
      appId: 'splunk-enterprise',
      appVersion: '1.16.2',
      installedVersion: '1.0.0',
      catalogEntry: { version: '1.16.2', releaseNotes: 'notes here', downloadUrl: DL },
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
      catalogEntry: { version: '1.16.2', downloadUrl: DL },
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

  it('does not advertise a phantom upgrade from a placeholder catalog version', () => {
    // on-disk 1.7.0, tenant on 1.2.0, placeholder catalog says 4.0.0 (no
    // downloadUrl). The real upgrade target is 1.7.0 — never 4.0.0.
    const info = buildAppVersionInfo({
      appId: 'okta-identity',
      appVersion: '1.7.0',
      installedVersion: '1.2.0',
      catalogEntry: { version: '4.0.0' },
    })
    expect(info.latestVersion).toBe('1.7.0')
    expect(info.upgradeAvailable).toBe(true)

    // And once the tenant is on the on-disk version, the banner clears entirely.
    const current = buildAppVersionInfo({
      appId: 'okta-identity',
      appVersion: '1.7.0',
      installedVersion: '1.7.0',
      catalogEntry: { version: '4.0.0' },
    })
    expect(current.latestVersion).toBe('1.7.0')
    expect(current.upgradeAvailable).toBe(false)
  })
})

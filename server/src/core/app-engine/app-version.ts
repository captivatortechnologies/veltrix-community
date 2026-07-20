// ========================================================================
// App Version helpers
//
// Pure, dependency-free logic for the per-tenant app upgrade flow:
//   • compareVersions   — semver-lite ordering of two version strings
//   • isUpgradeAvailable — is `installed` strictly older than `latest`?
//   • resolveLatestRelease — pick the newest of (registered on-disk, published
//                            catalog) version and the release notes for it
//   • buildAppVersionInfo  — the tenant-facing { installed, latest, upgrade… }
//
// Kept side-effect-free (no prisma / no fs) so it is trivially unit-testable and
// reusable by both the GET version endpoint and the POST upgrade endpoint.
// ========================================================================

import type { MarketplaceEntry } from './marketplace-catalog'

/** The release chosen as "latest available" for an app. */
export interface ResolvedRelease {
  version: string
  /** Markdown release notes for `version`, when the catalog carries them. */
  releaseNotes?: string
  /** ISO timestamp the release was published, when known. */
  releasedAt?: string
}

/** Tenant-facing version status for one app (the GET /:appId/version body). */
export interface AppVersionInfo {
  appId: string
  /** The version THIS tenant is running; null when the app is not installed. */
  installedVersion: string | null
  /** The newest version available to upgrade to. */
  latestVersion: string
  /** True when `installedVersion` is strictly older than `latestVersion`. */
  upgradeAvailable: boolean
  releaseNotes?: string
  releasedAt?: string
}

/**
 * Split a version string into its numeric release segments and an optional
 * prerelease tag. Leading `v`/`V` and any `+build` metadata are stripped. A
 * non-numeric release segment collapses to 0 so a malformed value still orders
 * deterministically rather than throwing.
 */
function parseVersion(raw: string): { release: number[]; prerelease: string | null } {
  const trimmed = (raw ?? '').trim().replace(/^[vV]/, '')
  const [noBuild] = trimmed.split('+')
  const dashIndex = noBuild.indexOf('-')
  const mainPart = dashIndex === -1 ? noBuild : noBuild.slice(0, dashIndex)
  const prerelease = dashIndex === -1 ? null : noBuild.slice(dashIndex + 1) || null
  const release = mainPart
    .split('.')
    .map((seg) => {
      const n = parseInt(seg, 10)
      return Number.isFinite(n) ? n : 0
    })
  return { release, prerelease }
}

/** Compare two dot-separated prerelease tags per semver precedence rules. */
function comparePrerelease(a: string, b: string): number {
  const as = a.split('.')
  const bs = b.split('.')
  const len = Math.max(as.length, bs.length)
  for (let i = 0; i < len; i++) {
    const x = as[i]
    const y = bs[i]
    // A shorter set of identifiers has lower precedence (1.0.0-alpha < 1.0.0-alpha.1).
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const d = parseInt(x, 10) - parseInt(y, 10)
      if (d !== 0) return d < 0 ? -1 : 1
    } else if (xn !== yn) {
      // Numeric identifiers always have lower precedence than alphanumeric ones.
      return xn ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/**
 * Semver-lite comparison. Returns -1 when `a` is older than `b`, 1 when newer,
 * and 0 when equal. Numeric release segments are compared left-to-right (missing
 * segments count as 0); a version WITH a prerelease tag is older than the same
 * release without one (1.2.0-rc.1 < 1.2.0).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.release.length, pb.release.length)
  for (let i = 0; i < len; i++) {
    const x = pa.release[i] ?? 0
    const y = pb.release[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  if (pa.prerelease && !pb.prerelease) return -1
  if (!pa.prerelease && pb.prerelease) return 1
  if (pa.prerelease && pb.prerelease) {
    const d = comparePrerelease(pa.prerelease, pb.prerelease)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * True when `installed` is a valid version strictly older than `latest`. A
 * null/blank installed version (app not installed) is never "upgradable".
 */
export function isUpgradeAvailable(installed: string | null | undefined, latest: string): boolean {
  if (!installed || !installed.trim()) return false
  return compareVersions(installed, latest) < 0
}

/**
 * Pick the newest of the registered on-disk version and the published catalog
 * version as the upgrade target, and attach the release notes that describe it.
 *
 * The catalog is the source of published release notes, so its notes are used
 * only when the catalog version is at least as new as the on-disk version
 * (i.e. the catalog actually describes the resolved latest). When the on-disk
 * copy is somehow ahead of the catalog, the on-disk version wins with no notes.
 */
export function resolveLatestRelease(
  appVersion: string,
  catalogEntry?: Pick<MarketplaceEntry, 'version' | 'releaseNotes' | 'releasedAt' | 'downloadUrl'> | null,
): ResolvedRelease {
  // A catalog entry only represents a real upgrade target when it is actually
  // installable — i.e. it carries a downloadUrl. "Coming soon" marketplace
  // placeholders (available: false, no downloadUrl) still declare a display
  // version — often the VENDOR's product version (e.g. Okta 4.0.0), unrelated to
  // the Veltrix app version — and advertising that as an upgrade produces a
  // phantom banner the tenant can never action. Ignore such entries and fall
  // back to the registered on-disk version.
  if (!catalogEntry?.version || !catalogEntry.downloadUrl) {
    return { version: appVersion }
  }
  const catalogIsNewerOrEqual = compareVersions(catalogEntry.version, appVersion) >= 0
  if (catalogIsNewerOrEqual) {
    return {
      version: catalogEntry.version,
      releaseNotes: catalogEntry.releaseNotes,
      releasedAt: catalogEntry.releasedAt,
    }
  }
  return { version: appVersion }
}

/**
 * Build the tenant-facing version status for an app from its registered
 * version, this tenant's installed version, and the catalog entry (if any).
 */
export function buildAppVersionInfo(input: {
  appId: string
  appVersion: string
  installedVersion: string | null
  catalogEntry?: Pick<MarketplaceEntry, 'version' | 'releaseNotes' | 'releasedAt' | 'downloadUrl'> | null
}): AppVersionInfo {
  const latest = resolveLatestRelease(input.appVersion, input.catalogEntry)
  return {
    appId: input.appId,
    installedVersion: input.installedVersion,
    latestVersion: latest.version,
    upgradeAvailable: isUpgradeAvailable(input.installedVersion, latest.version),
    releaseNotes: latest.releaseNotes,
    releasedAt: latest.releasedAt,
  }
}

// ========================================================================
// Marketplace Catalog
//
// The catalog is SINGLE-SOURCED from the community apps repo's published
// `catalog/catalog.json` (auto-generated per app release — see veltrix-apps'
// deploy-catalog workflow), fetched at runtime and refreshed periodically, so
// the app store always reflects the real releases without patching this file on
// every app version bump.
//
// The hardcoded FALLBACK_CATALOG below is only an OFFLINE safety net: it serves
// until the first fetch succeeds and whenever the remote catalog is unreachable
// (air-gapped install, GitHub down). It may be stale — the remote catalog is
// authoritative. Apps with available: true and a downloadUrl can be
// auto-installed; available: false are "coming soon" placeholders.
//
// Config (all optional, sensible defaults):
//   VELTRIX_APPS_REPO   `owner/repo` of the apps catalog (manifests + releases).
//   VELTRIX_CATALOG_URL explicit catalog.json URL (overrides the derived one) —
//                       point self-hosters at their own fork/mirror.
//   MARKETPLACE_CATALOG_REFRESH_MINUTES background refresh cadence (default 30).
// ========================================================================

/** `owner/repo` slug for the community apps catalog (manifests + release packages). */
const APPS_REPO = process.env.VELTRIX_APPS_REPO || 'captivatortechnologies/veltrix-apps'
const APPS_REPO_URL = `https://github.com/${APPS_REPO}`

/**
 * URL of the published catalog.json. Defaults to the raw file on the apps repo's
 * default branch; override with VELTRIX_CATALOG_URL for a fork/mirror/Pages host.
 */
const CATALOG_URL =
  process.env.VELTRIX_CATALOG_URL ||
  `https://raw.githubusercontent.com/${APPS_REPO}/main/catalog/catalog.json`

const REFRESH_MINUTES = Number(process.env.MARKETPLACE_CATALOG_REFRESH_MINUTES) || 30
const FETCH_TIMEOUT_MS = 8000

export interface MarketplaceEntry {
  /** Unique slug that matches the app's manifest id (e.g. 'crowdstrike-edr') */
  appId: string
  name: string
  version: string
  vendor: string
  description: string
  /** High-level category: SIEM | EDR | SOAR | IAM | NETWORK | CLOUD | COMPLIANCE */
  category: string
  /** Emoji or icon identifier used in the UI */
  icon?: string
  /**
   * Brand logo for the marketplace card: an https:// URL or a self-contained
   * data: URL (inlined by the catalog builder from the app's manifest logo).
   * When absent, the UI falls back to `icon`.
   */
  logo?: string
  /** Optional dark-background logo variant; same shape as `logo`. */
  logoDark?: string
  license?: string
  homepage?: string
  /** Whether the app can be installed right now. False = coming soon. */
  available: boolean
  tags?: string[]
  /** Direct URL to a downloadable package (.zip or .tar.gz). When set, the app can be auto-installed. */
  downloadUrl?: string
  /**
   * Markdown release notes for the current `version`. Surfaced to tenants in the
   * per-tenant upgrade flow (the "review the release notes before upgrading"
   * modal). Authored alongside the version bump; absent for apps that ship no
   * notes yet.
   */
  releaseNotes?: string
  /** ISO-8601 timestamp the current `version` was published, when known. */
  releasedAt?: string
  /** SHA-256 of the release package, from the catalog builder (integrity check). */
  sha256?: string
  /** Size of the release package in bytes, from the catalog builder. */
  sizeBytes?: number
}

// ------------------------------------------------------------------
// Offline fallback catalog — served only until the first successful remote
// fetch and whenever catalog.json is unreachable. May be stale; the remote
// catalog is authoritative. Keep entries minimal.
// ------------------------------------------------------------------

const FALLBACK_CATALOG: MarketplaceEntry[] = [
  {
    appId: 'splunk-enterprise',
    name: 'Splunk Enterprise',
    version: '1.16.2',
    vendor: 'Veltrix',
    description:
      'Manage Splunk Enterprise configurations as code. Includes index management, role definitions, BYOL infrastructure, and version tracking with full pipeline support for validation, deployment, rollback, health checks, and drift detection.',
    category: 'SIEM',
    icon: '🔍',
    license: 'Apache-2.0',
    homepage: `${APPS_REPO_URL}/tree/main/apps/splunk-enterprise`,
    available: true,
    tags: ['siem', 'splunk', 'indexes', 'roles', 'byol', 'configuration-management', 'drift-detection'],
    downloadUrl: `${APPS_REPO_URL}/releases/download/splunk-enterprise-v1.16.2/splunk-enterprise.zip`,
    releasedAt: '2026-07-15T00:00:00.000Z',
    releaseNotes: [
      '## Splunk Enterprise v1.16.2',
      '',
      '### Added',
      '- **Drift detection** for `indexes.conf` and `authorize.conf` — the pipeline now',
      '  flags configuration that has drifted from the deployed canvas and offers a',
      '  one-click re-deploy.',
      '- **BYOL infrastructure** topology view with per-stack subnet allocation.',
      '',
      '### Fixed',
      '- Role import no longer drops inherited capabilities when a parent role is',
      '  renamed.',
      '- Health checks correctly report `degraded` (rather than `down`) when a single',
      '  indexer in a cluster is unreachable.',
      '',
      '### Changed',
      '- Index sizing fields now validate against the target volume before deploy.',
      '',
      '> Upgrading is safe and non-destructive: your existing indexes, roles and',
      '> connections are preserved.',
    ].join('\n'),
  },
  {
    appId: 'crowdstrike-edr',
    name: 'CrowdStrike Falcon',
    version: '7.0.0',
    vendor: 'CrowdStrike',
    description:
      'AI-native endpoint detection and response (EDR) platform providing real-time threat visibility, automated prevention, and adversary intelligence across your entire endpoint estate.',
    category: 'EDR',
    icon: '🦅',
    license: 'Commercial',
    homepage: 'https://www.crowdstrike.com/products/endpoint-security/falcon-platform/',
    available: false,
    tags: ['edr', 'endpoint', 'threat-detection', 'ai', 'prevention', 'forensics'],
  },
  {
    appId: 'palo-alto-cortex-xsoar',
    name: 'Palo Alto Cortex XSOAR',
    version: '8.5.0',
    vendor: 'Palo Alto Networks',
    description:
      'Security orchestration, automation, and response (SOAR) platform that unifies alert management, incident response, and security workflows across your entire security stack.',
    category: 'SOAR',
    icon: '🔀',
    license: 'Commercial',
    homepage: 'https://www.paloaltonetworks.com/cortex/cortex-xsoar',
    available: false,
    tags: ['soar', 'orchestration', 'automation', 'incident-response', 'playbooks'],
  },
  {
    appId: 'elastic-security',
    name: 'Elastic Security',
    version: '8.13.0',
    vendor: 'Elastic',
    description:
      'Cloud-scale SIEM and security analytics built on the Elastic Stack. Correlate logs, metrics, and security events at petabyte scale with ML-powered anomaly detection and threat hunting.',
    category: 'SIEM',
    icon: '🔍',
    license: 'Commercial / Open Source',
    homepage: 'https://www.elastic.co/security',
    available: false,
    tags: ['siem', 'log-management', 'threat-hunting', 'ml', 'elk', 'analytics'],
  },
  {
    appId: 'hashicorp-vault',
    name: 'HashiCorp Vault',
    version: '1.17.0',
    vendor: 'HashiCorp',
    description:
      'Identity-based secrets and encryption management system for securely storing and controlling access to tokens, passwords, certificates, API keys, and other secrets.',
    category: 'IAM',
    icon: '🔐',
    license: 'BSL 1.1',
    homepage: 'https://www.vaultproject.io/',
    available: false,
    tags: ['secrets', 'iam', 'encryption', 'pki', 'dynamic-credentials', 'zero-trust'],
  },
  {
    appId: 'wiz-cloud-security',
    name: 'Wiz Cloud Security',
    version: '3.0.0',
    vendor: 'Wiz',
    description:
      'Agentless cloud security platform that provides full-stack risk visibility across AWS, Azure, GCP, and OCI. Identifies critical attack paths, misconfigurations, and vulnerabilities without deploying agents.',
    category: 'CLOUD',
    icon: '☁️',
    license: 'Commercial',
    homepage: 'https://www.wiz.io/',
    available: false,
    tags: ['cloud', 'cspm', 'cwpp', 'agentless', 'aws', 'azure', 'gcp', 'misconfiguration'],
  },
  {
    appId: 'tenable-vuln-management',
    name: 'Tenable Vulnerability Management',
    version: '10.0.0',
    vendor: 'Tenable',
    description:
      'Comprehensive vulnerability management platform that continuously assesses your attack surface, prioritizes vulnerabilities by risk, and provides remediation guidance across on-prem and cloud environments.',
    category: 'COMPLIANCE',
    icon: '🛡️',
    license: 'Commercial',
    homepage: 'https://www.tenable.com/products/tenable-io',
    available: false,
    tags: ['vulnerability-management', 'compliance', 'scanning', 'risk', 'patch', 'cvss'],
  },
  {
    appId: 'okta-identity',
    name: 'Okta Identity',
    version: '4.0.0',
    vendor: 'Okta',
    description:
      'Enterprise identity and access management platform providing single sign-on (SSO), multi-factor authentication (MFA), lifecycle management, and universal directory for workforce and customer identities.',
    category: 'IAM',
    icon: '🪪',
    license: 'Commercial',
    homepage: 'https://www.okta.com/',
    available: false,
    tags: ['iam', 'sso', 'mfa', 'identity', 'zero-trust', 'lifecycle-management', 'saml', 'oidc'],
  },
]

// ------------------------------------------------------------------
// Live catalog cache — populated by refreshMarketplaceCatalog() from the remote
// catalog.json. Accessors are SYNC + pure and read `liveCatalog ?? FALLBACK`,
// so the app store surfaces the remote catalog when loaded and degrades to the
// offline fallback otherwise. No consumer had to change.
// ------------------------------------------------------------------

let liveCatalog: MarketplaceEntry[] | null = null
let inFlight: Promise<void> | null = null

function currentCatalog(): MarketplaceEntry[] {
  return liveCatalog ?? FALLBACK_CATALOG
}

/** Test-only: drop the live cache so accessors fall back to FALLBACK_CATALOG. */
export function __resetMarketplaceCatalogForTests(): void {
  liveCatalog = null
  inFlight = null
}

/** Coerce one raw catalog.json entry into a MarketplaceEntry, or null if invalid. */
function toEntry(raw: unknown): MarketplaceEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const appId = typeof r.appId === 'string' ? r.appId : null
  const name = typeof r.name === 'string' ? r.name : null
  const version = typeof r.version === 'string' ? r.version : null
  if (!appId || !name || !version) return null // the three fields every consumer relies on
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  return {
    appId,
    name,
    version,
    vendor: str(r.vendor) ?? 'Unknown',
    description: str(r.description) ?? '',
    category: str(r.category) ?? 'OTHER',
    icon: str(r.icon),
    logo: str(r.logo),
    logoDark: str(r.logoDark),
    license: str(r.license),
    homepage: str(r.homepage),
    available: r.available === true,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : undefined,
    downloadUrl: str(r.downloadUrl),
    releaseNotes: str(r.releaseNotes),
    releasedAt: str(r.releasedAt),
    sha256: str(r.sha256),
    sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : undefined,
  }
}

/**
 * Fetch the published catalog.json and swap it into the live cache. Best-effort:
 * never throws — on any failure (network, non-200, malformed JSON, zero valid
 * entries) it logs a warning and leaves the current cache (or fallback) in place.
 * Concurrent callers share a single in-flight request.
 */
export async function refreshMarketplaceCatalog(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(CATALOG_URL, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { apps?: unknown }
      const rawApps = Array.isArray(body?.apps) ? body.apps : []
      const mapped = rawApps.map(toEntry).filter((e): e is MarketplaceEntry => e !== null)
      if (mapped.length === 0) throw new Error('catalog.json contained no valid entries')
      liveCatalog = mapped
      // eslint-disable-next-line no-console
      console.log(`[marketplace] catalog loaded: ${mapped.length} apps from ${CATALOG_URL}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // eslint-disable-next-line no-console
      console.warn(
        `[marketplace] catalog refresh failed (${msg}); serving ${
          liveCatalog ? 'last-good' : 'offline fallback'
        } catalog from ${CATALOG_URL}`,
      )
    } finally {
      clearTimeout(timer)
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Kick off the initial fetch and a periodic background refresh. Call once at
 * boot. The interval is unref'd so it never keeps the process alive. Returns a
 * stop function.
 */
export function startMarketplaceCatalogAutoRefresh(): () => void {
  void refreshMarketplaceCatalog()
  const handle = setInterval(() => void refreshMarketplaceCatalog(), REFRESH_MINUTES * 60_000)
  handle.unref?.()
  return () => clearInterval(handle)
}

// ------------------------------------------------------------------
// Catalog API (unchanged shape — sync + pure, reads the live-or-fallback catalog)
// ------------------------------------------------------------------

export const marketplaceCatalog = {
  /**
   * Return every entry in the catalog.
   */
  getAll(): MarketplaceEntry[] {
    return currentCatalog()
  },

  /**
   * Find a single entry by its unique appId slug.
   * Returns null when no match is found.
   */
  getById(appId: string): MarketplaceEntry | null {
    return currentCatalog().find((entry) => entry.appId === appId) ?? null
  },

  /**
   * Full-text search across name, vendor, description, category, and tags.
   * Matching is case-insensitive; the query is trimmed before comparison.
   */
  search(query: string): MarketplaceEntry[] {
    const term = query.trim().toLowerCase()
    const catalog = currentCatalog()
    if (!term) return catalog

    return catalog.filter((entry) => {
      const haystack = [
        entry.name,
        entry.vendor,
        entry.description,
        entry.category,
        ...(entry.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  },

  /**
   * Filter entries by category (case-insensitive).
   * e.g. getByCategory('SIEM') or getByCategory('iam')
   */
  getByCategory(category: string): MarketplaceEntry[] {
    const normalized = category.trim().toUpperCase()
    return currentCatalog().filter((entry) => entry.category.toUpperCase() === normalized)
  },
}

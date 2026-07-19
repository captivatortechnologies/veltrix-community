// ========================================================================
// Marketplace Catalog
//
// Static registry of marketplace apps available for installation.
// Acts as a lightweight discovery layer for the app store UI.
//
// In the future this could be backed by a remote API or database, but
// for now it is a hardcoded catalog. Apps with available: true and a
// downloadUrl can be auto-installed from the marketplace. Apps with
// available: false are "coming soon" placeholders.
//
// The community-apps GitHub repo backing the installable entries below is
// configurable via VELTRIX_APPS_REPO (default: the public veltrix-apps repo
// under this project's own GitHub org) rather than hardcoded to any single
// operator's fork — self-hosters who maintain their own apps repo/catalog
// fork can point this at it without patching source.
// ========================================================================

/** `owner/repo` slug for the community apps catalog (manifests + release packages). */
const APPS_REPO = process.env.VELTRIX_APPS_REPO || 'veltrix-community/veltrix-apps'
const APPS_REPO_URL = `https://github.com/${APPS_REPO}`

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
}

// ------------------------------------------------------------------
// Seed data
// Splunk Enterprise is the first installable app (available: true).
// Remaining entries are placeholders until integration packages ship.
// ------------------------------------------------------------------

const CATALOG: MarketplaceEntry[] = [
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
// Catalog API
// ------------------------------------------------------------------

export const marketplaceCatalog = {
  /**
   * Return every entry in the catalog.
   */
  getAll(): MarketplaceEntry[] {
    return CATALOG
  },

  /**
   * Find a single entry by its unique appId slug.
   * Returns null when no match is found.
   */
  getById(appId: string): MarketplaceEntry | null {
    return CATALOG.find((entry) => entry.appId === appId) ?? null
  },

  /**
   * Full-text search across name, vendor, description, category, and tags.
   * Matching is case-insensitive; the query is trimmed before comparison.
   */
  search(query: string): MarketplaceEntry[] {
    const term = query.trim().toLowerCase()
    if (!term) return CATALOG

    return CATALOG.filter((entry) => {
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
    return CATALOG.filter((entry) => entry.category.toUpperCase() === normalized)
  },
}

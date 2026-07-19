// ============================================================================
// Feature Flags
//
// Centralized feature flag system. All flags are read from environment
// variables with sensible defaults, so features can be toggled via Helm
// values, Docker env vars, or a .env file without a code change.
//
// Community Edition defaults:
//   - Pipeline features (drift/canary/blue-green/approvals) ship FREE and
//     default ON — they are the product, not an upsell.
//   - Commercial/hosted-only concerns (billing, multi-tenant SaaS ops,
//     Veltrix-managed hosted connectivity, BYOC cloud provisioning) default
//     OFF and their backing modules are not part of this codebase at all;
//     the flags exist so the same wiring can be reused by a hosted fork.
//   - Optional SSO providers (Cognito/Google/Microsoft/OIDC) default OFF —
//     local email+password auth is the default, self-host-friendly path.
// ============================================================================

export interface FeatureFlags {
  // Optional SSO providers. Local bcrypt+JWT auth works standalone; these
  // gate whether server.ts even registers the corresponding route plugin.
  oauth: {
    cognito: { enabled: boolean }
    google: { enabled: boolean }
    microsoft: { enabled: boolean }
    oidc: { enabled: boolean }
  }

  // Hosted commercial billing (Stripe/subscription tiers). The billing
  // modules themselves are NOT present in Community Edition — this flag
  // only governs the no-op stubs in middlewares/tenant-isolation.middleware.ts
  // so a hosted fork can drop the real implementation in behind it.
  billing: { enabled: boolean }

  // Security-as-Code pipeline features — free in Community Edition.
  pipeline: {
    driftDetection: {
      enabled: boolean
      intervalMinutes: number
    }
    canaryDeployments: { enabled: boolean }
    blueGreenDeployments: { enabled: boolean }
    approvalWorkflow: { enabled: boolean }
  }

  platform: {
    marketplace: { enabled: boolean }
    /** Multi-tenant SaaS ops. Community Edition is single-tenant; off by default. */
    multiTenant: { enabled: boolean }
    auditLog: { enabled: boolean }
    webhooks: { enabled: boolean }
    /** Tenant developer sandboxes (Veltrix CLI dev mode). Off by default. */
    sandbox: { enabled: boolean }
    /**
     * Veltrix-managed hosted Tailscale (ZTNA). Self-host-inapplicable —
     * requires a Veltrix-operated tailnet. Off by default; the generic
     * connectivity-provider adapters (SSH/WireGuard/self-managed Tailscale)
     * are unaffected by this flag.
     */
    hostedConnectivity: { enabled: boolean }
    /**
     * BYOC cloud-account registration feeding hosted AWS provisioning.
     * Off by default in a self-hosted deployment.
     */
    cloudProvisioning: { enabled: boolean }
  }
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key]
  if (val === undefined || val === '') return fallback
  return val === 'true' || val === '1'
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key]
  if (!val) return fallback
  const parsed = parseInt(val, 10)
  return isNaN(parsed) ? fallback : parsed
}

let cachedFlags: FeatureFlags | null = null

export function getFeatureFlags(): FeatureFlags {
  if (cachedFlags) return cachedFlags

  cachedFlags = {
    oauth: {
      cognito: { enabled: envBool('FEATURE_OAUTH_COGNITO', false) },
      google: { enabled: envBool('FEATURE_OAUTH_GOOGLE', false) },
      microsoft: { enabled: envBool('FEATURE_OAUTH_MICROSOFT', false) },
      oidc: { enabled: envBool('FEATURE_OAUTH_OIDC', false) },
    },
    billing: {
      enabled: envBool('FEATURE_BILLING', false),
    },
    pipeline: {
      driftDetection: {
        enabled: envBool('FEATURE_PIPELINE_DRIFT_DETECTION', true),
        intervalMinutes: envInt('DRIFT_DETECTION_INTERVAL_MINUTES', 60),
      },
      canaryDeployments: { enabled: envBool('FEATURE_PIPELINE_CANARY', true) },
      blueGreenDeployments: { enabled: envBool('FEATURE_PIPELINE_BLUE_GREEN', true) },
      approvalWorkflow: { enabled: envBool('FEATURE_PIPELINE_APPROVALS', true) },
    },
    platform: {
      marketplace: { enabled: envBool('MARKETPLACE_ENABLED', true) },
      multiTenant: { enabled: envBool('FEATURE_MULTI_TENANT', false) },
      auditLog: { enabled: envBool('AUDIT_LOG_ENABLED', true) },
      webhooks: { enabled: envBool('FEATURE_WEBHOOKS', true) },
      sandbox: { enabled: envBool('SANDBOX_ENABLED', false) },
      hostedConnectivity: { enabled: envBool('FEATURE_HOSTED_CONNECTIVITY', false) },
      cloudProvisioning: { enabled: envBool('FEATURE_CLOUD_PROVISIONING', false) },
    },
  }

  return cachedFlags
}

/**
 * Reset cached flags (useful for testing or dynamic reconfiguration).
 */
export function resetFeatureFlags(): void {
  cachedFlags = null
}

/**
 * Check a single feature flag by dot-path.
 * e.g., isFeatureEnabled('oauth.cognito') or isFeatureEnabled('pipeline.canaryDeployments')
 */
export function isFeatureEnabled(path: string): boolean {
  const flags = getFeatureFlags()
  const parts = path.split('.')
  let current: any = flags

  for (const part of parts) {
    if (current === undefined || current === null) return false
    current = current[part]
  }

  if (typeof current === 'boolean') return current
  if (typeof current === 'object' && current !== null && 'enabled' in current) return current.enabled
  return false
}

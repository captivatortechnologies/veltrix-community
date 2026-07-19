import React, { createContext, useContext, useState, useEffect } from 'react'
import { API_URL } from '@/config'

// Community Edition flag schema. Premium pipeline features (canary,
// blue-green, drift detection, approval workflows) ship free here — they're
// the product, not an upsell — so they default enabled, same as upstream.
// The commercial-only schema (billing.stripe/paypal, platform.multiTenant)
// has been removed entirely rather than merely defaulted off: this is a
// single-tenant, self-hosted build with no billing module to gate. The
// `isEnabled(path)` resolution mechanism itself is unchanged, so a
// self-hosted fork that reintroduces an optional billing/multi-tenant
// module can extend this schema without touching the provider.
interface FeatureFlags {
  oauth: {
    cognito: { enabled: boolean }
    google: { enabled: boolean }
    microsoft: { enabled: boolean }
  }
  pipeline: {
    driftDetection: { enabled: boolean; intervalMinutes: number }
    canaryDeployments: { enabled: boolean }
    blueGreenDeployments: { enabled: boolean }
    approvalWorkflow: { enabled: boolean }
  }
  platform: {
    marketplace: { enabled: boolean }
    auditLog: { enabled: boolean }
    webhooks: { enabled: boolean }
    sandbox: { enabled: boolean }
  }
}

const defaultFlags: FeatureFlags = {
  // Cognito/Google/Microsoft are optional SSO providers layered on top of the
  // default LOCAL (bcrypt+JWT) auth — all default off so a fresh self-hosted
  // instance never has a hard dependency on an external identity provider.
  oauth: { cognito: { enabled: false }, google: { enabled: false }, microsoft: { enabled: false } },
  pipeline: {
    driftDetection: { enabled: true, intervalMinutes: 60 },
    canaryDeployments: { enabled: true },
    blueGreenDeployments: { enabled: true },
    approvalWorkflow: { enabled: true },
  },
  platform: { marketplace: { enabled: true }, auditLog: { enabled: true }, webhooks: { enabled: true }, sandbox: { enabled: false } },
}

interface FeatureFlagContextValue {
  flags: FeatureFlags
  isEnabled: (path: string) => boolean
  loading: boolean
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: defaultFlags,
  isEnabled: () => false,
  loading: true,
})

export const useFeatureFlags = () => useContext(FeatureFlagContext)

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/feature-flags`)
      .then((res) => res.json())
      .then((data) => setFlags(data))
      .catch(() => {}) // Use defaults on error
      .finally(() => setLoading(false))
  }, [])

  const isEnabled = (path: string): boolean => {
    const parts = path.split('.')
    let current: any = flags
    for (const part of parts) {
      if (current === undefined || current === null) return false
      current = current[part]
    }
    if (typeof current === 'boolean') return current
    if (typeof current === 'object' && 'enabled' in current) return current.enabled
    return false
  }

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, loading }}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

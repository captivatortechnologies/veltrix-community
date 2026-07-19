import React from 'react'
import { ConnectivityProvidersView } from '../../features/connectivity-providers'

/**
 * Settings › Connectivity (ZTNA).
 *
 * Zero-Trust Network Access / connectivity providers are cross-app: every app
 * that deploys configuration reaches its targets through the customer's
 * configured providers (Tailscale, WireGuard, SSH, Cloudflare Tunnel, ...).
 * They previously lived inside a per-app settings tab; this surfaces them once,
 * platform-wide, under Settings.
 */
const ConnectivityPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Connectivity (ZTNA)</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Zero-Trust Network Access providers used platform-wide to reach the servers, domains, and
          IPs your apps deploy to. Configure them once here — every installed app can use them.
        </p>
      </div>
      <ConnectivityProvidersView />
    </div>
  )
}

export default ConnectivityPage

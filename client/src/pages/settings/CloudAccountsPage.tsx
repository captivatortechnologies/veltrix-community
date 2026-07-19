import React from 'react'
import { CloudAccountsView } from '../../features/cloud-accounts'
import { tenantCloudAccountApi } from '../../services/cloudAccountApi'

/**
 * Settings › Cloud Accounts (BYOC).
 *
 * Bring-your-own-cloud credentials are cross-app: any app that provisions or
 * manages cloud infrastructure reaches your cloud accounts through the
 * connections configured here (AWS, Azure, GCP, Hetzner). This mirrors the
 * Connectivity (ZTNA) settings page pattern — configure once, every
 * installed app that provisions cloud resources can use it.
 */
const CloudAccountsPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cloud Accounts</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Connect the cloud provider accounts Veltrix should provision and manage infrastructure in.
          Configure them once here — every installed app that deploys cloud resources can use them.
        </p>
      </div>
      <CloudAccountsView api={tenantCloudAccountApi} />
    </div>
  )
}

export default CloudAccountsPage

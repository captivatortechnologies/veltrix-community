import React from 'react'
import { TicketingProvidersView } from '../../features/ticketing-providers'

/**
 * Settings › Ticketing.
 *
 * Per-tenant change/issue-management provider configuration (ServiceNow,
 * Zendesk, ...) used to link a configuration canvas to an external ticket.
 * Mirrors ConnectivityPage.tsx: configured once here, platform-wide.
 */
const TicketingPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Ticketing</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Connect your change/issue-management system so configurations can be linked to a ticket for
          change and issue tracking. Configure it once here — every configuration can use it.
        </p>
      </div>
      <TicketingProvidersView />
    </div>
  )
}

export default TicketingPage

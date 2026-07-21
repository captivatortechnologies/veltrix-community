// Registry mapping each ticketing provider to a singleton adapter (mirrors
// cloud-account/adapters/index.ts and connectivity-provider/adapters/index.ts).
//
// Adding a 3rd provider (Jira, GitHub Issues, …) is: write a new adapter here,
// add its id to TICKETING_PROVIDERS in ../ticketing.schema.ts, and add one line
// to this registry. No schema migration, no changes to the routes or service.

import { TicketProvider } from './types'
import { ServiceNowAdapter } from './servicenow.adapter'
import { ZendeskAdapter } from './zendesk.adapter'
import { TICKETING_PROVIDERS, TicketingProviderId, isTicketingProvider } from '../ticketing.schema'

const adapterRegistry: Record<TicketingProviderId, TicketProvider> = {
  servicenow: new ServiceNowAdapter(),
  zendesk: new ZendeskAdapter(),
}

/** Retrieve the adapter for a provider. Throws if the provider is unknown. */
export function getTicketProvider(provider: string): TicketProvider {
  if (!isTicketingProvider(provider)) {
    throw new Error(`Unknown ticketing provider: ${provider}`)
  }
  return adapterRegistry[provider]
}

export { TicketProvider, TICKETING_PROVIDERS }
export * from './types'

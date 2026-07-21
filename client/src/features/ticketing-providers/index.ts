// Shared ticketing providers feature — import from Settings → Ticketing.
export { default as TicketingProvidersView } from './components/TicketingProvidersView'
export { default as ProviderConfigDialog } from './components/ProviderConfigDialog'
export { TICKETING_PROVIDER_SCHEMAS, getTicketingProviderSchemaList } from './ticketingProviderSchemas'
export type {
  TicketingProviderSchema,
  TicketingFieldDefinition,
  TicketingAuthMethod,
} from './ticketingProviderSchemas'

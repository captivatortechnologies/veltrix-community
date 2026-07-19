// Tenant bring-your-own-cloud (BYOC) connections feature — used by
// pages/settings/CloudAccountsPage. (The platform-operator-only global
// provider/region catalog view that used to live here was dropped: it only
// served the excluded platform-admin portal.)
export { default as CloudAccountsView } from './components/CloudAccountsView'
export type { CloudAccountsViewProps } from './components/CloudAccountsView'
export { default as CloudAccountDialog } from './components/CloudAccountDialog'
export {
  CLOUD_PROVIDER_SCHEMAS,
  getCloudProviderSchemaList,
  getAuthMethodSchema,
} from './cloudProviderSchemas'
export type { CloudProviderSchema, CloudAuthMethodSchema, CloudFieldDefinition } from './cloudProviderSchemas'

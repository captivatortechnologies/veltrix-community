import type { CloudProviderType } from '@/services/cloudAccountApi'

// ---------------------------------------------------------------------------
// Field + Schema types
// ---------------------------------------------------------------------------

export interface CloudFieldDefinition {
  name: string
  label: string
  type: 'text' | 'password' | 'textarea' | 'number' | 'select'
  placeholder?: string
  required?: boolean
  helpText?: string
  /**
   * Marks a field as a secret. Secret values are masked by the server on
   * read (`••••••xxxx`) and are never round-tripped into the form — on edit
   * the field starts blank with a "leave blank to keep existing" placeholder,
   * and it is only sent to the server when the user types a new value.
   */
  secret?: boolean
  options?: { value: string; label: string }[]
}

export interface CloudAuthMethodSchema {
  authMethod: string
  displayName: string
  description: string
  /** Setup guidance shown in the dialog (e.g. how to create the trust relationship). */
  hint?: string
  fields: CloudFieldDefinition[]
}

export interface CloudProviderSchema {
  provider: CloudProviderType
  displayName: string
  shortDescription: string
  icon: string // emoji, mirrors the connectivity-providers icon convention
  authMethods: CloudAuthMethodSchema[]
}

// ---------------------------------------------------------------------------
// AWS
// ---------------------------------------------------------------------------

const awsAssumeRole: CloudAuthMethodSchema = {
  authMethod: 'assume-role',
  displayName: 'Assume Role',
  description: 'Veltrix assumes an IAM role in your AWS account via STS using a trust policy scoped to an external ID.',
  hint: 'Create an IAM role that trusts the Veltrix provisioning principal, with a trust condition on this external ID. Attach a least-privilege policy scoped to only the resources Veltrix should manage.',
  fields: [
    { name: 'roleArn', label: 'Role ARN', type: 'text', required: true, placeholder: 'arn:aws:iam::123456789012:role/VeltrixProvisioning', helpText: 'ARN of the IAM role Veltrix should assume' },
    { name: 'externalId', label: 'External ID', type: 'text', required: true, placeholder: 'a unique, hard-to-guess string', helpText: "Must match the external ID configured on the role's trust policy" },
  ],
}

const awsSchema: CloudProviderSchema = {
  provider: 'aws',
  displayName: 'Amazon Web Services',
  shortDescription: 'Assume an IAM role via STS',
  icon: '🟧',
  authMethods: [awsAssumeRole],
}

// ---------------------------------------------------------------------------
// Azure
// ---------------------------------------------------------------------------

const azureBrokered: CloudAuthMethodSchema = {
  authMethod: 'brokered',
  displayName: 'Brokered (Veltrix Connector App)',
  description: 'Grant admin consent to the Veltrix connector app registration in your Azure AD tenant. No secrets to manage.',
  hint: 'Grant admin consent to the Veltrix connector app in Azure AD for this tenant. (A guided consent flow is coming soon — for now, consent must be granted out of band.)',
  fields: [
    { name: 'tenantId', label: 'Tenant ID', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000', helpText: 'Azure AD (Entra ID) tenant ID' },
  ],
}

const azureByoSp: CloudAuthMethodSchema = {
  authMethod: 'byo-sp',
  displayName: 'Bring Your Own Service Principal',
  description: 'Authenticate using a service principal you create and manage in your own Azure AD tenant.',
  hint: 'Create an app registration and service principal with a client secret, then assign it the appropriate RBAC role on the target subscription.',
  fields: [
    { name: 'tenantId', label: 'Tenant ID', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000', helpText: 'Azure AD (Entra ID) tenant ID' },
    { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000', helpText: 'Application (client) ID of the service principal' },
    { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true, secret: true, helpText: 'Client secret value for the service principal' },
    { name: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000', helpText: 'Target Azure subscription ID' },
  ],
}

const azureSchema: CloudProviderSchema = {
  provider: 'azure',
  displayName: 'Microsoft Azure',
  shortDescription: 'Brokered consent or bring-your-own service principal',
  icon: '🔷',
  authMethods: [azureBrokered, azureByoSp],
}

// ---------------------------------------------------------------------------
// GCP
// ---------------------------------------------------------------------------

const gcpWorkloadIdentity: CloudAuthMethodSchema = {
  authMethod: 'wif',
  displayName: 'Workload Identity Federation',
  description: 'Authenticate without a long-lived key by federating Veltrix as an external identity provider.',
  hint: 'Create a workload identity pool and provider trusting Veltrix, and grant the service account impersonation permissions to the pool.',
  fields: [
    { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: 'my-gcp-project', helpText: 'GCP project ID' },
    { name: 'workloadIdentityProvider', label: 'Workload Identity Provider', type: 'text', required: true, placeholder: 'projects/123/locations/global/workloadIdentityPools/veltrix/providers/veltrix', helpText: 'Full resource name of the workload identity provider' },
    { name: 'serviceAccountEmail', label: 'Service Account Email', type: 'text', required: true, placeholder: 'veltrix-provisioning@my-gcp-project.iam.gserviceaccount.com', helpText: 'Service account Veltrix will impersonate' },
  ],
}

const gcpServiceAccountKey: CloudAuthMethodSchema = {
  authMethod: 'sa-key',
  displayName: 'Service Account Key',
  description: 'Authenticate using a downloaded service account key JSON file. Simpler to set up, but a long-lived credential.',
  hint: 'Create a service account with least-privilege roles, generate a JSON key, and paste its contents below.',
  fields: [
    { name: 'projectId', label: 'Project ID', type: 'text', required: true, placeholder: 'my-gcp-project', helpText: 'GCP project ID' },
    { name: 'serviceAccountKeyJson', label: 'Service Account Key (JSON)', type: 'textarea', required: true, secret: true, placeholder: '{\n  "type": "service_account",\n  ...\n}', helpText: 'Full contents of the downloaded service account key JSON file' },
  ],
}

const gcpSchema: CloudProviderSchema = {
  provider: 'gcp',
  displayName: 'Google Cloud Platform',
  shortDescription: 'Workload identity federation or a service account key',
  icon: '🔺',
  authMethods: [gcpWorkloadIdentity, gcpServiceAccountKey],
}

// ---------------------------------------------------------------------------
// Hetzner
// ---------------------------------------------------------------------------

const hetznerToken: CloudAuthMethodSchema = {
  authMethod: 'token',
  displayName: 'API Token',
  description: 'Authenticate using a Hetzner Cloud project API token.',
  hint: 'Generate a Read & Write API token from the Hetzner Cloud Console under your project\'s Security > API Tokens.',
  fields: [
    { name: 'token', label: 'API Token', type: 'password', required: true, secret: true, helpText: 'Hetzner Cloud project API token' },
  ],
}

const hetznerSchema: CloudProviderSchema = {
  provider: 'hetzner',
  displayName: 'Hetzner Cloud',
  shortDescription: 'Project API token',
  icon: '🖥️',
  authMethods: [hetznerToken],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const CLOUD_PROVIDER_SCHEMAS: Record<CloudProviderType, CloudProviderSchema> = {
  aws: awsSchema,
  azure: azureSchema,
  gcp: gcpSchema,
  hetzner: hetznerSchema,
}

/** Get all cloud provider schemas as an ordered array. */
export function getCloudProviderSchemaList(): CloudProviderSchema[] {
  const order: CloudProviderType[] = ['aws', 'azure', 'gcp', 'hetzner']
  return order.map((provider) => CLOUD_PROVIDER_SCHEMAS[provider])
}

/** Look up a specific auth-method schema within a provider. */
export function getAuthMethodSchema(
  provider: CloudProviderType,
  authMethod: string
): CloudAuthMethodSchema | undefined {
  return CLOUD_PROVIDER_SCHEMAS[provider]?.authMethods.find((m) => m.authMethod === authMethod)
}

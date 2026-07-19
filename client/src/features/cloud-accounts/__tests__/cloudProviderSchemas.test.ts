import { describe, it, expect } from 'vitest'
import {
  CLOUD_PROVIDER_SCHEMAS,
  getAuthMethodSchema,
  getCloudProviderSchemaList,
} from '../cloudProviderSchemas'
import type { CloudProviderType } from '@/services/cloudAccountApi'

describe('cloudProviderSchemas', () => {
  it('registers all four supported providers', () => {
    const providers = Object.keys(CLOUD_PROVIDER_SCHEMAS) as CloudProviderType[]
    expect(providers.sort()).toEqual(['aws', 'azure', 'gcp', 'hetzner'])
  })

  it('gives every provider at least one auth method with at least one field', () => {
    for (const schema of Object.values(CLOUD_PROVIDER_SCHEMAS)) {
      expect(schema.authMethods.length).toBeGreaterThan(0)
      for (const method of schema.authMethods) {
        expect(method.fields.length).toBeGreaterThan(0)
      }
    }
  })

  it('returns schemas in a stable, deterministic order', () => {
    const list = getCloudProviderSchemaList()
    expect(list.map((s) => s.provider)).toEqual(['aws', 'azure', 'gcp', 'hetzner'])
  })

  it('flags known secret fields and leaves non-secret fields unflagged', () => {
    const awsAssumeRole = getAuthMethodSchema('aws', 'assume-role')
    expect(awsAssumeRole).toBeDefined()
    expect(awsAssumeRole?.fields.find((f) => f.name === 'roleArn')?.secret).toBeFalsy()
    expect(awsAssumeRole?.fields.find((f) => f.name === 'externalId')?.secret).toBeFalsy()

    const azureByoSp = getAuthMethodSchema('azure', 'byo-sp')
    expect(azureByoSp?.fields.find((f) => f.name === 'clientSecret')?.secret).toBe(true)
    expect(azureByoSp?.fields.find((f) => f.name === 'tenantId')?.secret).toBeFalsy()

    const gcpSaKey = getAuthMethodSchema('gcp', 'sa-key')
    expect(gcpSaKey?.fields.find((f) => f.name === 'serviceAccountKeyJson')?.secret).toBe(true)
    expect(gcpSaKey?.fields.find((f) => f.name === 'serviceAccountKeyJson')?.type).toBe('textarea')

    const hetznerToken = getAuthMethodSchema('hetzner', 'token')
    expect(hetznerToken?.fields.find((f) => f.name === 'token')?.secret).toBe(true)
  })

  it('exposes both azure auth methods (brokered and byo-sp)', () => {
    expect(getAuthMethodSchema('azure', 'brokered')).toBeDefined()
    expect(getAuthMethodSchema('azure', 'byo-sp')).toBeDefined()
  })

  it('exposes both gcp auth methods (wif and sa-key)', () => {
    expect(getAuthMethodSchema('gcp', 'wif')).toBeDefined()
    expect(getAuthMethodSchema('gcp', 'sa-key')).toBeDefined()
  })

  it('returns undefined for an unknown auth method', () => {
    expect(getAuthMethodSchema('aws', 'does-not-exist')).toBeUndefined()
  })
})

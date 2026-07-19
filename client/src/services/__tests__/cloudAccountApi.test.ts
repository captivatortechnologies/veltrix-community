import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { API_URL } from '@/config'
import { tenantCloudAccountApi } from '../cloudAccountApi'
import type { CloudAccountConnection } from '../cloudAccountApi'

const mockAccount: CloudAccountConnection = {
  id: 'acc-1',
  customerId: 'cust-1',
  scope: 'customer',
  provider: 'aws',
  name: 'Prod AWS',
  authMethod: 'assume-role',
  config: { roleArn: 'arn:aws:iam::123456789012:role/VeltrixProvisioning', externalId: 'ext-123' },
  status: 'UNVERIFIED',
  statusMessage: null,
  isDefault: true,
  lastTestedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response)

describe('cloudAccountApi', () => {
  beforeEach(() => {
    window.localStorage.setItem('token', 'test-token')
    global.fetch = vi.fn()
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('tenantCloudAccountApi', () => {
    it('lists accounts against the tenant base path with an auth header', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(jsonResponse([mockAccount]))

      const result = await tenantCloudAccountApi.list()

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/cloud-accounts`,
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) })
      )
      expect(result).toEqual([mockAccount])
    })

    it('creates an account by POSTing to the tenant base path', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(jsonResponse(mockAccount))

      await tenantCloudAccountApi.create({
        provider: 'aws',
        authMethod: 'assume-role',
        name: 'Prod AWS',
        config: { roleArn: 'arn:aws:iam::123456789012:role/VeltrixProvisioning', externalId: 'ext-123' },
      })

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/cloud-accounts`,
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('updates an account by PUTing to the tenant :id path', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(jsonResponse(mockAccount))

      await tenantCloudAccountApi.update('acc-1', { name: 'Renamed' })

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/cloud-accounts/acc-1`,
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Renamed' }) })
      )
    })

    it('removes an account by DELETEing the tenant :id path without a Content-Type header', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(Promise.resolve({ ok: true, status: 204 } as Response))

      await tenantCloudAccountApi.remove('acc-1')

      const [, init] = vi.mocked(global.fetch).mock.calls[0];
      expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/cloud-accounts/acc-1`, expect.objectContaining({ method: 'DELETE' }))
      expect((init?.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    })

    it('tests a connection by POSTing to the tenant :id/test path', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(jsonResponse({ success: true, message: 'Connected', latencyMs: 42 }))

      const result = await tenantCloudAccountApi.test('acc-1')

      expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/cloud-accounts/acc-1/test`, expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({ success: true, message: 'Connected', latencyMs: 42 })
    })

    it('throws with the server-provided error message on failure', async () => {
      vi.mocked(global.fetch).mockReturnValueOnce(jsonResponse({ error: 'Invalid role ARN' }, false, 400))

      await expect(tenantCloudAccountApi.create({
        provider: 'aws',
        authMethod: 'assume-role',
        name: 'Bad',
        config: {},
      })).rejects.toThrow('Invalid role ARN')
    })
  })
})

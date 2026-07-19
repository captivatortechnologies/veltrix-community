// ========================================================================
// Tests: webhook.route + webhook.controller — auth/signature gating
// (R0, RBAC/IdP hardening 2026-07-10).
//
// webhook.service is mocked wholesale so these tests isolate the
// route/controller wiring: API-key gate on both endpoints, and the
// GitHub signature gate becoming mandatory when a secret is configured.
// ========================================================================

import Fastify from 'fastify'
import { webhookRoutes } from '../webhook.route'
import { webhookService } from '../webhook.service'

jest.mock('../webhook.service', () => ({
  webhookService: {
    validateApiKey: jest.fn(),
    validateGitHubSignature: jest.fn(),
    isGitHubSecretConfigured: jest.fn(),
    processWebhook: jest.fn(),
  },
}))

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockValidateApiKey = webhookService.validateApiKey as jest.Mock
const mockValidateSignature = webhookService.validateGitHubSignature as jest.Mock
const mockIsSecretConfigured = webhookService.isGitHubSecretConfigured as jest.Mock
const mockProcessWebhook = webhookService.processWebhook as jest.Mock

describe('webhook routes — auth gating', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    app = Fastify()
    app.register(webhookRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => jest.clearAllMocks())

  describe('POST /api/webhooks (generic ingest)', () => {
    it('401s without an X-API-Key header — not actually public', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        payload: { source: 'ci', event: 'build', payload: { ok: true } },
      })
      expect(res.statusCode).toBe(401)
      expect(mockValidateApiKey).not.toHaveBeenCalled()
    })

    it('401s with an X-API-Key that fails validation (no webhook scope / revoked / unknown)', async () => {
      mockValidateApiKey.mockResolvedValue(false)
      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        headers: { 'x-api-key': 'not-a-webhook-key' },
        payload: { source: 'ci', event: 'build', payload: { ok: true } },
      })
      expect(res.statusCode).toBe(401)
    })

    it('processes the webhook when the API key is valid and webhook-scoped', async () => {
      mockValidateApiKey.mockResolvedValue(true)
      mockProcessWebhook.mockResolvedValue({ success: true, message: 'ok', id: 'evt-1' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        headers: { 'x-api-key': 'valid-webhook-key' },
        payload: { source: 'ci', event: 'build', payload: { ok: true } },
      })

      expect(res.statusCode).toBe(200)
      expect(mockProcessWebhook).toHaveBeenCalled()
    })
  })

  describe('POST /api/webhooks/github', () => {
    const baseHeaders = {
      'x-api-key': 'valid-webhook-key',
      'x-github-event': 'push',
      'x-github-delivery': 'delivery-1',
    }

    beforeEach(() => {
      mockValidateApiKey.mockResolvedValue(true)
    })

    it('401s without a valid API key, before signature is even considered', async () => {
      mockValidateApiKey.mockResolvedValue(false)
      mockIsSecretConfigured.mockReturnValue(true)

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: baseHeaders,
        payload: { action: 'opened' },
      })

      expect(res.statusCode).toBe(401)
      expect(mockValidateSignature).not.toHaveBeenCalled()
    })

    it('401s when a secret IS configured and the signature is missing (was previously a silent pass-through)', async () => {
      mockIsSecretConfigured.mockReturnValue(true)
      mockValidateSignature.mockReturnValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: baseHeaders, // no x-hub-signature-256
        payload: { action: 'opened' },
      })

      expect(res.statusCode).toBe(401)
      expect(mockProcessWebhook).not.toHaveBeenCalled()
    })

    it('401s when a secret IS configured and the signature is invalid', async () => {
      mockIsSecretConfigured.mockReturnValue(true)
      mockValidateSignature.mockReturnValue(false)

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: { ...baseHeaders, 'x-hub-signature-256': 'sha256=forged' },
        payload: { action: 'opened' },
      })

      expect(res.statusCode).toBe(401)
      expect(mockProcessWebhook).not.toHaveBeenCalled()
    })

    it('processes when a secret is configured and the signature is valid', async () => {
      mockIsSecretConfigured.mockReturnValue(true)
      mockValidateSignature.mockReturnValue(true)
      mockProcessWebhook.mockResolvedValue({ success: true, message: 'ok', id: 'evt-2' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: { ...baseHeaders, 'x-hub-signature-256': 'sha256=valid' },
        payload: { action: 'opened' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockProcessWebhook).toHaveBeenCalled()
    })

    it('processes (with a loud warn) when NO secret is configured — never calls validateGitHubSignature', async () => {
      mockIsSecretConfigured.mockReturnValue(false)
      mockProcessWebhook.mockResolvedValue({ success: true, message: 'ok', id: 'evt-3' })

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhooks/github',
        headers: baseHeaders,
        payload: { action: 'opened' },
      })

      expect(res.statusCode).toBe(200)
      expect(mockValidateSignature).not.toHaveBeenCalled()
      expect(mockProcessWebhook).toHaveBeenCalled()
    })
  })
})

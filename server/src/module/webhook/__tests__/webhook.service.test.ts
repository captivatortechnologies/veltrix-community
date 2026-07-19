// ========================================================================
// Tests: webhook.service — GitHub HMAC signature verification (R0, RBAC/IdP
// hardening 2026-07-10).
//
// WEBHOOK_SECRET is read once at module load, so "configured" vs
// "unconfigured" scenarios each get their own jest.resetModules() +
// require() in an isolated env.
// ========================================================================

import crypto from 'crypto'

jest.mock('../../logger/logger.service', () => ({
  loggerService: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('../../api-key/api-key.service', () => ({
  apiKeyService: { verifyApiKey: jest.fn(), getApiKeyDetails: jest.fn() },
}))

const ORIGINAL_ENV = process.env

function loadServiceWithSecret(secret?: string) {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV }
  delete process.env.WEBHOOK_SECRET
  delete process.env.GITHUB_WEBHOOK_SECRET
  if (secret !== undefined) {
    process.env.WEBHOOK_SECRET = secret
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../webhook.service').webhookService
}

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('webhookService.isGitHubSecretConfigured', () => {
  it('is false when neither WEBHOOK_SECRET nor GITHUB_WEBHOOK_SECRET is set', () => {
    const svc = loadServiceWithSecret(undefined)
    expect(svc.isGitHubSecretConfigured()).toBe(false)
  })

  it('is true when WEBHOOK_SECRET is set', () => {
    const svc = loadServiceWithSecret('a-real-secret')
    expect(svc.isGitHubSecretConfigured()).toBe(true)
  })

  it('no longer falls back to a known literal default (the pre-fix footgun)', () => {
    const svc = loadServiceWithSecret(undefined)
    // The old code defaulted to the literal 'default-webhook-secret' and would
    // have "validated" a signature computed against that public string.
    const payload = JSON.stringify({ hello: 'world' })
    const forgedSignature =
      'sha256=' + crypto.createHmac('sha256', 'default-webhook-secret').update(payload).digest('hex')
    expect(svc.validateGitHubSignature(payload, forgedSignature)).toBe(false)
  })
})

describe('webhookService.validateGitHubSignature', () => {
  const SECRET = 'test-webhook-secret'

  it('accepts a correctly signed payload', () => {
    const svc = loadServiceWithSecret(SECRET)
    const payload = JSON.stringify({ action: 'opened' })
    const signature = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
    expect(svc.validateGitHubSignature(payload, signature)).toBe(true)
  })

  it('rejects a payload signed with the wrong secret', () => {
    const svc = loadServiceWithSecret(SECRET)
    const payload = JSON.stringify({ action: 'opened' })
    const signature = 'sha256=' + crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex')
    expect(svc.validateGitHubSignature(payload, signature)).toBe(false)
  })

  it('rejects a missing signature', () => {
    const svc = loadServiceWithSecret(SECRET)
    expect(svc.validateGitHubSignature(JSON.stringify({}), undefined)).toBe(false)
  })

  it('rejects a malformed signature (no sha256= prefix) without throwing', () => {
    const svc = loadServiceWithSecret(SECRET)
    expect(svc.validateGitHubSignature(JSON.stringify({}), 'not-a-real-signature')).toBe(false)
  })

  it('rejects a short/garbage signature value without throwing (length-mismatch guard)', () => {
    const svc = loadServiceWithSecret(SECRET)
    expect(svc.validateGitHubSignature(JSON.stringify({}), 'sha256=deadbeef')).toBe(false)
  })

  it('rejects any signature when no secret is configured (fail closed)', () => {
    const svc = loadServiceWithSecret(undefined)
    const payload = JSON.stringify({ action: 'opened' })
    const signature = 'sha256=' + crypto.createHmac('sha256', 'anything').update(payload).digest('hex')
    expect(svc.validateGitHubSignature(payload, signature)).toBe(false)
  })
})

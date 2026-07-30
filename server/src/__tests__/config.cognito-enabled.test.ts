// ========================================================================
// Tests: config.cognito.enabled must fail CLOSED on an unusable pool.
//
// Cognito is opt-in in the Community Edition (`COGNITO_ENABLED === 'true'`),
// but the flag alone said nothing about whether the pool is actually usable —
// an admin who set the flag but left the pool variables blank still reported
// Cognito as enabled with an empty userPoolId/clientId, so the login page
// offered a Cognito sign-in path whose /auth-url could only answer
// provider_disabled. `enabled` therefore now also requires the pool to be
// addressable (a user pool id AND a client id). These tests pin all cases,
// including that a fully-configured deployment is unaffected.
//
// Adapted from the private monorepo (d34142f57), which fixes the same failure
// on its default-on (`!== 'false'`) flag; OSS is opt-in, so the "nothing set"
// case is already off — the meaningful fix here is the flag-on-but-no-pool one.
// ========================================================================

const POOL_KEYS = ['COGNITO_ENABLED', 'COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'] as const

/**
 * config.ts reads process.env at import time (and calls dotenv, which may pull
 * a developer's real .env), so each case loads it in isolation with these keys
 * explicitly controlled rather than inherited.
 */
function loadCognitoConfig(env: Partial<Record<(typeof POOL_KEYS)[number], string>>) {
  const saved = { ...process.env }
  POOL_KEYS.forEach((k) => delete process.env[k])
  Object.entries(env).forEach(([k, v]) => {
    process.env[k] = v
  })

  let cognito: { enabled: boolean; userPoolId: string; clientId: string }
  jest.isolateModules(() => {
    cognito = require('../config').config.cognito
  })

  process.env = saved
  return cognito!
}

describe('config.cognito.enabled', () => {
  it('is FALSE when nothing is configured (opt-in flag is off)', () => {
    expect(loadCognitoConfig({}).enabled).toBe(false)
  })

  it('is FALSE when the flag is on but the pool is blank — fails closed on an unusable pool', () => {
    expect(loadCognitoConfig({ COGNITO_ENABLED: 'true' }).enabled).toBe(false)
  })

  it('is FALSE when the flag is on and only the user pool id is set (no client id)', () => {
    expect(
      loadCognitoConfig({ COGNITO_ENABLED: 'true', COGNITO_USER_POOL_ID: 'us-east-1_POOL' }).enabled
    ).toBe(false)
  })

  it('is TRUE only when the flag is on AND both pool id and client id are set', () => {
    const cognito = loadCognitoConfig({
      COGNITO_ENABLED: 'true',
      COGNITO_USER_POOL_ID: 'us-east-1_POOL',
      COGNITO_CLIENT_ID: 'client-abc',
    })
    expect(cognito.enabled).toBe(true)
    expect(cognito.userPoolId).toBe('us-east-1_POOL')
    expect(cognito.clientId).toBe('client-abc')
  })

  it('is FALSE when the flag is explicitly off even with a fully-configured pool', () => {
    expect(
      loadCognitoConfig({
        COGNITO_ENABLED: 'false',
        COGNITO_USER_POOL_ID: 'us-east-1_POOL',
        COGNITO_CLIENT_ID: 'client-abc',
      }).enabled
    ).toBe(false)
  })
})

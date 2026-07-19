// ============================================================================
// Test-only environment defaults.
//
// src/config/env.ts fails fast (exits the process) if JWT_SECRET,
// JWT_REFRESH_SECRET, ENCRYPTION_KEY, COOKIE_SECRET or DATABASE_URL are
// unset — by design, there is no public fallback for a secret anywhere in
// application source. That gate must not silently weaken for tests, so
// instead this file fills in dummy values ONLY when a variable is not
// already set, purely so `npm test` works out of the box on a fresh
// checkout without requiring a real .env file.
//
// Real values always win: CI (see .github/workflows/ci.yml) sets
// JWT_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_KEY explicitly, and those
// take precedence over the defaults below. None of these values are ever
// used outside a test process.
// ============================================================================

const testDefaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://veltrix:veltrix@localhost:5432/veltrix_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-only-jwt-secret-do-not-use-outside-tests-0',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-do-not-use-outside-tests',
  ENCRYPTION_KEY: 'test-only-encryption-key-do-not-use-outside-tests',
  COOKIE_SECRET: 'test-only-cookie-secret-do-not-use-outside-tests-0',
};

for (const [key, value] of Object.entries(testDefaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

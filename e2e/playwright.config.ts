import { defineConfig } from '@playwright/test'

// Optionally load e2e/.env.e2e (copy it from .env.e2e.example and fill in values that match
// your local dev seed). No dotenv dependency — this uses Node's built-in env-file loader
// (Node >= 20.12). `process.loadEnvFile` throws if the file is absent (or on older Node), so
// the try/catch simply falls back to whatever env vars are already exported.
try {
  process.loadEnvFile('.env.e2e')
} catch {
  // No .env.e2e on disk (or Node < 20.12) — rely on already-exported env vars.
}

/**
 * Playwright config for the Veltrix Community Edition E2E suite.
 *
 * - Drives the Vite client on :5173; the Fastify API is on :5000.
 * - Runs serially (workers: 1) because every spec shares one dev server + one
 *   Postgres DB, so parallel writes would race. Specs use unique, prefixed
 *   resource names so re-runs never collide with earlier data.
 * - `setup` logs in through the real login UI once as the dev fixture user
 *   (dev@local.test) and saves storageState.json; every other spec reuses that
 *   authenticated session via the `chromium`/`verify` projects.
 * - Uses the installed Chrome (`channel: 'chrome'`) so no browser download is needed.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: false,
  // One retry absorbs transient live-dev-server hiccups (HMR pings, in-flight
  // navigations). A real regression still fails both attempts.
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    channel: 'chrome',
  },
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { storageState: 'storageState.json' },
      testIgnore: [/auth\.setup\.ts/],
    },
    // Same as chromium but WITHOUT the setup dependency — reuses the already
    // saved storageState.json. Used for iterating on a single spec
    // (`--project=verify tests/x.spec.ts`) without re-running login.
    {
      name: 'verify',
      use: { storageState: 'storageState.json' },
      testIgnore: [/auth\.setup\.ts/],
    },
  ],
})

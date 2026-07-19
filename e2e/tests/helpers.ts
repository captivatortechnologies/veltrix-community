import { readFileSync } from 'node:fs'
import type { APIRequestContext, Page } from '@playwright/test'
import { expect, request as pwRequest } from '@playwright/test'

/**
 * Test credentials are supplied via the environment — see `e2e/.env.e2e.example`
 * (copy it to `.env.e2e`, which playwright.config.ts loads automatically, or export
 * the variables directly). The password defaults below are SAFE PLACEHOLDERS, not real
 * accounts: set E2E_PASSWORD / E2E_ADMIN_PASSWORD to match whatever your local dev seed
 * created before running the suite. Never hardcode real passwords in this file.
 */

/** Local-dev test fixture account (localhost only). Overridable via env. */
export const CREDS = {
  email: process.env.E2E_EMAIL || 'dev@local.test',
  password: process.env.E2E_PASSWORD || 'CHANGE_ME_SET_E2E_PASSWORD',
}

/** Seeded admin account (server/prisma/seed/admin-account.ts). Overridable via env. */
export const ADMIN_CREDS = {
  email: process.env.E2E_ADMIN_EMAIL || 'admin@veltrix.local',
  password: process.env.E2E_ADMIN_PASSWORD || 'CHANGE_ME_SET_E2E_ADMIN_PASSWORD',
}

export const STORAGE_STATE = 'storageState.json'
export const ADMIN_STORAGE_STATE = 'storageState.platform-admin.json'
export const API_URL = process.env.E2E_API_URL || 'http://localhost:5000/api'

/** App slug used for app-scoped feature tests (installed by default in dev). */
export const APP_ID = process.env.E2E_APP_ID || 'crowdstrike-edr'

/**
 * Password for run-created fixture users — only the email needs to be unique. Env-driven;
 * falls back to a per-run random value that satisfies the server's password-complexity
 * policy, so no secret is ever hardcoded here.
 */
export const TEST_PASSWORD =
  process.env.E2E_TEST_PASSWORD || `E2e!${Math.random().toString(36).slice(2, 10)}Aa9`

/** Unique, human-readable suffix so re-runs never collide on unique-name fields. */
export function uniq(prefix: string): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${prefix}-${stamp}${rand}`
}

/** Reads the persisted bearer token out of a saved storageState file. */
export function readToken(path: string = STORAGE_STATE): string {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>
  }
  for (const origin of raw.origins ?? []) {
    const hit = origin.localStorage?.find((e) => e.name === 'token')
    if (hit?.value) return hit.value
  }
  throw new Error(`No auth token found in ${path} — did the matching setup project run?`)
}

/** Bearer-authorized headers for direct API assertions (read paths need no CSRF). */
export function authHeaders(path: string = STORAGE_STATE): Record<string, string> {
  return { Authorization: `Bearer ${readToken(path)}`, 'Content-Type': 'application/json' }
}

/** Bearer-authorized headers from an explicit token (e.g. one returned by `apiLogin`). */
export function bearerHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/**
 * GET a JSON API path and assert 2xx; returns the parsed body. Reads the bearer token from
 * `storageStatePath` (defaults to the regular-user storageState.json).
 */
export async function apiGet<T = unknown>(
  request: APIRequestContext,
  path: string,
  storageStatePath: string = STORAGE_STATE,
): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: authHeaders(storageStatePath) })
  expect(res.ok(), `GET ${path} → ${res.status()}`).toBeTruthy()
  return (await res.json()) as T
}

export interface LoginResult {
  token: string
  user: {
    id: string
    email: string
    name: string
    role: string
    customerId: string
    isPlatformAdmin: boolean
  }
}

/**
 * Logs in via POST /auth/login using a standalone request context (works from
 * `test.beforeAll`, unlike the `request` test fixture). Throws if the account
 * requires 2FA (use the login UI directly for 2FA flows) or the call fails.
 */
export async function apiLogin(email: string, password: string): Promise<LoginResult> {
  const ctx = await pwRequest.newContext()
  try {
    const res = await ctx.post(`${API_URL}/auth/login`, { data: { email, password } })
    if (!res.ok()) {
      throw new Error(`apiLogin(${email}) → ${res.status()}: ${await res.text()}`)
    }
    const body = (await res.json()) as LoginResult & { requires2fa?: boolean }
    if (body.requires2fa) {
      throw new Error(`apiLogin(${email}) requires 2FA — log in through the UI for this account`)
    }
    return body
  } finally {
    await ctx.dispose()
  }
}

/** Fetches a fresh admin bearer token (does not depend on storageState files). */
export async function adminToken(): Promise<string> {
  return (await apiLogin(ADMIN_CREDS.email, ADMIN_CREDS.password)).token
}

async function parseJsonOrUndefined(res: Awaited<ReturnType<APIRequestContext['post']>>): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** POST a JSON API path with an explicit bearer token; asserts 2xx and returns the parsed body. */
export async function apiPost<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const res = await request.post(`${API_URL}${path}`, { headers: bearerHeaders(token), data })
  expect(res.ok(), `POST ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await parseJsonOrUndefined(res)) as T
}

/** PUT a JSON API path with an explicit bearer token; asserts 2xx and returns the parsed body. */
export async function apiPut<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const res = await request.put(`${API_URL}${path}`, { headers: bearerHeaders(token), data })
  expect(res.ok(), `PUT ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await parseJsonOrUndefined(res)) as T
}

/**
 * DELETE an API path with an explicit bearer token; asserts 2xx and returns the parsed body.
 * Deliberately sends only the Authorization header (no Content-Type) — DELETE calls here never
 * have a body, and a `Content-Type: application/json` header with an empty body 400s
 * (`FST_ERR_CTP_EMPTY_JSON_BODY`) on Fastify's JSON body parser.
 */
export async function apiDelete<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
): Promise<T> {
  const res = await request.delete(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(res.ok(), `DELETE ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await parseJsonOrUndefined(res)) as T
}

/** GET a JSON API path with an explicit bearer token; asserts 2xx and returns the parsed body. */
export async function apiGetWithToken<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: bearerHeaders(token) })
  expect(res.ok(), `GET ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

/**
 * CSRF-aware mutations for routes the server's double-submit CSRF middleware does NOT
 * exempt (server/src/middlewares/csrf.middleware.ts's `excludePaths`). Tenant-scoped
 * mutations like `/api/roles` and `/api/users` are NOT exempt, so creating a role or a
 * user from a raw API context 403s ("CSRF token missing from cookie") without these.
 *
 * The flow: any GET through the middleware sets an `XSRF-TOKEN` cookie (double-submit
 * pattern) if the calling `APIRequestContext` doesn't already carry one; the caller then
 * echoes that value back in an `X-XSRF-TOKEN` header on the state-changing call. Playwright's
 * `request` fixture keeps its own cookie jar per test, so `fetchCsrfToken` only needs to read
 * the token value out of the bootstrap response — the context resends the cookie itself.
 */
function extractCsrfCookie(res: Awaited<ReturnType<APIRequestContext['get']>>): string | undefined {
  for (const { name, value } of res.headersArray()) {
    if (name.toLowerCase() !== 'set-cookie') continue
    const match = /XSRF-TOKEN=([^;]+)/.exec(value)
    if (match) return match[1]
  }
  return undefined
}

/** Bootstraps (or reuses) `token`'s CSRF double-submit cookie and returns its value. */
export async function fetchCsrfToken(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${API_URL}/me/permissions`, { headers: bearerHeaders(token) })
  expect(res.ok(), `GET /me/permissions (csrf bootstrap) → ${res.status()}`).toBeTruthy()
  const csrf = extractCsrfCookie(res)
  if (!csrf) {
    throw new Error('Server did not set an XSRF-TOKEN cookie — has csrf.middleware.ts changed?')
  }
  return csrf
}

/** POST with a CSRF double-submit header attached; asserts 2xx and returns the parsed body. */
export async function csrfPost<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const csrf = await fetchCsrfToken(request, token)
  const res = await request.post(`${API_URL}${path}`, {
    headers: { ...bearerHeaders(token), 'X-XSRF-TOKEN': csrf },
    data,
  })
  expect(res.ok(), `POST ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await parseJsonOrUndefined(res)) as T
}

/** PUT with a CSRF double-submit header attached; asserts 2xx and returns the parsed body. */
export async function csrfPut<T = unknown>(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
): Promise<T> {
  const csrf = await fetchCsrfToken(request, token)
  const res = await request.put(`${API_URL}${path}`, {
    headers: { ...bearerHeaders(token), 'X-XSRF-TOKEN': csrf },
    data,
  })
  expect(res.ok(), `PUT ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await parseJsonOrUndefined(res)) as T
}

/**
 * PUT with a CSRF double-submit header attached, WITHOUT asserting success — for callers
 * that expect (and want to assert on) a specific failure response, e.g. a blocked
 * privilege-escalation attempt. Returns the raw response.
 */
export async function csrfPutExpectingFailure(
  request: APIRequestContext,
  path: string,
  token: string,
  data?: unknown,
): ReturnType<APIRequestContext['put']> {
  const csrf = await fetchCsrfToken(request, token)
  return request.put(`${API_URL}${path}`, {
    headers: { ...bearerHeaders(token), 'X-XSRF-TOKEN': csrf },
    data,
  })
}

/**
 * Provisions a tenant + its initial admin user, using an explicit admin password so the caller
 * never depends on the one-time-reveal tempPassword. Returns the created ids/credentials for use
 * in beforeAll fixtures.
 *
 * NOTE (Community Edition): this helper posts to `/platform-admin/customers`, which is part of
 * the hosted/commercial surface excluded from the OSS server. The RBAC, IdP/SSO, and 2FA specs
 * that call it therefore still need decoupling from platform-admin provisioning before they run
 * green against the single-tenant OSS server (they should provision the fixture tenant/user via
 * the OSS user/role seed + admin APIs instead). Tracked as follow-up — see the e2e README.
 */
export async function provisionTenant(
  request: APIRequestContext,
  token: string,
  opts: { namePrefix: string; adminPassword: string; tier?: 'free' | 'starter' | 'professional' | 'enterprise' },
): Promise<{
  customerId: string
  customerName: string
  domain: string
  adminId: string
  adminEmail: string
  adminPassword: string
}> {
  const name = uniq(opts.namePrefix)
  const domain = `${name}.e2e.test`
  const adminEmail = `${name}-admin@e2e.test`
  const body = await apiPost<{
    customer: { id: string; name: string }
    admin: { id: string; email: string }
  }>(request, '/platform-admin/customers', token, {
    name,
    domain,
    tier: opts.tier,
    admin: { email: adminEmail, firstName: 'E2E', lastName: 'Admin', password: opts.adminPassword },
  })
  return {
    customerId: body.customer.id,
    customerName: body.customer.name,
    domain,
    adminId: body.admin.id,
    adminEmail: body.admin.email,
    adminPassword: opts.adminPassword,
  }
}

/** Dismiss any toast so it doesn't cover a subsequent click. */
export async function clearToasts(page: Page): Promise<void> {
  await page.mouse.click(2, 2)
}

/**
 * Full two-step login through the real UI: email → "Next" → password → "Sign in". Mirrors
 * `auth.setup.ts` exactly. Waits until the app leaves /login. Pass `expectTwoFactor: true` to
 * stop after the password step (a 3rd `#two-factor-code` step should be visible next).
 *
 * Pass `rememberMe: true` to check the "Remember me" box before submitting — `setAuthData`
 * (authService.ts) stores the token in `localStorage` only when this is checked, `sessionStorage`
 * otherwise. Most pages read the token through the shared `getToken()`/`authAxios` helper
 * (apiClient.ts), which correctly falls back across both storages either way — but a few call
 * sites (e.g. IdentityProviderPage.tsx's handleSave/handleTestConnection) read
 * `localStorage.getItem('token')` directly and silently no-op with a "please login" warning for
 * a sessionStorage-only session. Use `rememberMe: true` when driving one of those flows.
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
  opts: { expectTwoFactor?: boolean; rememberMe?: boolean } = {},
): Promise<void> {
  await page.goto('/login')

  const emailField = page.locator('#email')
  await expect(emailField).toBeVisible()
  await emailField.fill(email)
  await page.getByRole('button', { name: /^next$/i }).click()

  const passwordField = page.locator('#password')
  await expect(passwordField).toBeVisible()
  await passwordField.fill(password)
  if (opts.rememberMe) {
    await page.getByLabel('Remember me').check()
  }
  await page.getByRole('button', { name: /^sign in$/i }).click()

  if (opts.expectTwoFactor) {
    await expect(page.getByLabel('Verification code')).toBeVisible()
    return
  }

  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 25_000 })
}

/**
 * Attempts the two-step login and asserts it fails with the given inline banner text (the
 * "Authentication Error" banner on LoginPage — same copy for bad password, deactivated user,
 * and a suspended tenant, by design). Leaves the user on /login.
 */
export async function expectLoginToFail(page: Page, email: string, password: string, errorText: RegExp | string) {
  await page.goto('/login')

  const emailField = page.locator('#email')
  await expect(emailField).toBeVisible()
  await emailField.fill(email)
  await page.getByRole('button', { name: /^next$/i }).click()

  const passwordField = page.locator('#password')
  await expect(passwordField).toBeVisible()
  await passwordField.fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page.getByRole('alert').getByText(errorText)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
}

/** Opens a shared `Select` combobox by its label and picks the option with the given name. */
export async function selectOption(page: Page, label: string, optionName: string | RegExp): Promise<void> {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: optionName, exact: typeof optionName === 'string' }).click()
}

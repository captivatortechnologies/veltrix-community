import { test, expect, type Page, type Locator } from '@playwright/test'
import { OAuth2Server, Events, type MutableToken } from 'oauth2-mock-server'
import { API_URL, TEST_PASSWORD, adminToken, apiGetWithToken, apiLogin, apiPost, loginViaUI, provisionTenant, uniq } from './helpers'

/**
 * GET a JSON API path with NO authentication — for the two genuinely public,
 * pre-login endpoints this spec calls directly (`/cognito/auth-url`). Unlike
 * `helpers.ts`'s `apiGet`, this doesn't depend on a saved storageState file
 * existing on disk (this endpoint needs no token at all).
 */
async function publicGet<T = unknown>(request: import('@playwright/test').APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`)
  expect(res.ok(), `GET ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

/**
 * IdP correctness + instant-on (Wave I, `_ai_tasks/rbac-idp-hardening/2026-07-10/01_plan.md`).
 *
 * Provider choice: AWS Cognito. Of the three real providers (Google/Microsoft/Cognito), only
 * Cognito's admin UI actually round-trips `jitMode` (google.route.ts/microsoft.route.ts's
 * `POST /config` body schemas omit `jitMode` — Fastify's `removeAdditional` AJV default
 * silently strips it before the handler ever sees it) and only Cognito's config-read path
 * (`cognitoService.getConfig`, via `authAxios`) actually sends `X-Customer-ID` — Google/
 * Microsoft's `getConfig()` uses a bare unauthenticated `axios.get` with no headers at all, so
 * their settings-page read-back always shows the GLOBAL config regardless of who's viewing it.
 * Both are real, currently-unfixed gaps outside this task's scope — see the final report.
 *
 * HERMETICITY — read before extending this file: `oauth2-mock-server` is started below and used
 * to mint a realistically-signed-but-untrusted token for the forged-token assertions. It is
 * NOT — and, as the code is currently written, CANNOT be — the trusted issuer for an actual
 * Google/Microsoft/Cognito login:
 *   - Cognito: `aws-jwt-verify`'s `CognitoJwtVerifier.create({ userPoolId, clientId })` derives
 *     the issuer/JWKS URL unconditionally from `userPoolId` (`cognito-idp.<region>.amazonaws.com`,
 *     parsed via its own internal regex) — there is no issuer/JWKS override parameter.
 *   - Google: `google-auth-library`'s `OAuth2Client.verifyIdToken` fetches Google's real
 *     federated-signon certs; `google.service.ts` never passes the library's (undocumented)
 *     endpoint-override option.
 *   - Microsoft: `@azure/msal-common`'s `Authority.defaultOpenIdConfigurationEndpoint` only
 *     skips its AAD-specific `v2.0/` discovery-path prefix when the MSAL client config sets
 *     `protocolMode: 'OIDC'` — `microsoft.service.ts`'s `createMsalClient` sets neither that nor
 *     any authority override the admin UI actually exposes a field for. Changing it would alter
 *     real-Microsoft-tenant token validation behavior and is out of scope for a test-only change.
 * Consequently, every assertion that requires PASSING real signature verification (JIT domain-
 * match provisioning, unknown-domain rejection, deactivated-user/suspended-tenant SSO gate
 * parity) cannot be driven end-to-end without real AWS/Google/Microsoft cloud credentials this
 * environment does not have — the same class of limitation the task's own instructions
 * anticipated ("Cognito's AWS admin calls"). Each skipped bullet is called out at its natural
 * point below with the precise reason; all of them ARE covered today by real, passing
 * server-side unit tests that exercise the same functions directly (see the comments below for
 * exact file references) — this file does not re-fake that coverage.
 *
 * UPDATE (generic OIDC provider): the four limitations above are specific to Google/Microsoft/
 * Cognito's hardcoded vendor trust chains. The generic OIDC provider added alongside this update
 * (`server/src/module/oidc`) does OIDC discovery + JWKS verification against whatever issuer its
 * config points at — for this environment, that legitimately includes `oauth2-mock-server`, since
 * "bring your own OIDC issuer" is the actual feature, not a test-only bypass. The second
 * `test.describe` block below uses a SEPARATE mock issuer instance as OIDC's real, trusted
 * issuer and proves every SUCCESS path this file previously could only document as skipped:
 * JIT domain-match provisioning, unknown-domain rejection, deactivated-user/suspended-tenant gate
 * parity, nonce/state replay protection, and a truthful Test Connection success — all through the
 * real UI/API, with real (locally-generated) cryptographic signature verification.
 */

const REGION = 'us-east-1'

// ---------------------------------------------------------------------------
// Unsigned-JWT construction (hand-crafted forged token — no library needed).
// ---------------------------------------------------------------------------

function base64url(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value)
  return Buffer.from(json, 'utf8').toString('base64url')
}

/** A syntactically well-formed but completely UNSIGNED (alg:none) JWT. */
function buildUnsignedJwt(claims: Record<string, unknown>): string {
  const header = base64url({ alg: 'none', typ: 'JWT' })
  const payload = base64url(claims)
  return `${header}.${payload}.`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

// ---------------------------------------------------------------------------
// IdentityProviderPage (Access Control -> Identity Provider tab) locators.
// Mirrors the scoping pattern already validated by
// client/src/pages/access/__tests__/IdentityProviderPage.test.tsx
// (`screen.getByText('AWS Cognito').closest('div.border')`).
// ---------------------------------------------------------------------------

async function gotoIdentityProviderTab(page: Page): Promise<void> {
  await page.goto('/access-control')
  await page.getByRole('heading', { name: 'Access Control', level: 1 }).waitFor()
  await page.getByRole('tab', { name: 'Identity Provider' }).click()
  await page.getByRole('heading', { name: 'Identity Providers', level: 1 }).waitFor()
}

function providerCard(page: Page, name: string): Locator {
  return page.locator('div.border', { hasText: name }).first()
}

/**
 * Config-panel fields render `<label>`/`<input>` with no htmlFor/id — walk
 * from the label. Plain fields put the `<input>` as a direct sibling of the
 * `<label>`; SECRET fields (clientSecret, awsSecretAccessKey — see
 * SECRET_CONFIG_KEYS in IdentityProviderPage.tsx) wrap it one level deeper,
 * in a sibling `<div>` alongside a "Replace secret"/"Cancel" button, so the
 * `<input>` is a following DESCENDANT, not a following SIBLING. `following::`
 * (not `following-sibling::`) finds the very next `<input>` in document
 * order regardless of which shape applies — by construction nothing else
 * intervenes between a field's own label and its own input.
 */
function providerField(card: Locator, label: string): Locator {
  return card.locator('label', { hasText: label, exact: true }).locator('xpath=following::input[1]')
}

function providerSelect(card: Locator, label: string): Locator {
  return card.locator('label', { hasText: label, exact: true }).locator('xpath=following-sibling::select[1]')
}

async function openConfigPanel(card: Locator): Promise<void> {
  const configureButton = card.getByRole('button', { name: 'Configure' })
  if (await configureButton.count()) {
    await configureButton.click()
  }
}

/**
 * Pre-existing, out-of-scope finding uncovered while extending this file:
 * `handleSave` (IdentityProviderPage.tsx) POSTs EVERY provider currently
 * marked enabled in the form's local state, not just the one an admin is
 * actually editing. This dev environment's GLOBAL Microsoft and Cognito
 * rows are both `enabled:true` with incomplete required fields (verified
 * live: `GET /api/microsoft`/`GET /api/cognito` — blank `clientId`/
 * `userPoolId`) — a real admin inheriting that global default and saving
 * ANY unrelated provider's settings gets a generic "Failed to save
 * settings" with no indication which provider actually caused it. Reported
 * as a finding; fixing `handleSave` to save only the touched provider (or
 * to report partial success/failure per provider) is a real, separate
 * product change outside the OIDC seam this file is proving.
 *
 * Toggling an unrelated provider off before Save is side-effect-free here
 * — a provider whose `enabled` is false is never sent to the server at all
 * (see every `provider.type === '...' && provider.enabled` guard in
 * handleSave), so this never persists an actual "disabled" state for it
 * either. Lets each test below focus on just the provider it tests.
 */
async function disableOtherEnabledProviders(page: Page, keepName: string): Promise<void> {
  for (const name of ['AWS Cognito', 'Google Login', 'Microsoft Azure AD', 'OAuth 2.0 / OIDC']) {
    if (name === keepName) continue
    const checkbox = providerCard(page, name).getByRole('checkbox')
    if (await checkbox.isChecked().catch(() => false)) {
      await checkbox.click({ force: true })
      await expect(checkbox).not.toBeChecked()
    }
  }
}

test.describe('Identity Provider (SSO) configuration + instant-on', () => {
  let mockIssuer: OAuth2Server

  test.beforeAll(async () => {
    // Started per the plan's instruction and used to mint a realistically-signed-but-untrusted
    // token for the forged-token assertions below — see the file-level comment for exactly why
    // it cannot be wired into any of the three real providers' trust chain as currently coded.
    mockIssuer = new OAuth2Server()
    await mockIssuer.issuer.keys.generate('RS256')
    await mockIssuer.start(0, 'localhost')
  })

  test.afterAll(async () => {
    await mockIssuer.stop()
  })

  test('configuring AWS Cognito through the admin UI (customer-specific, JIT domain-match) persists, and Test Connection reports truthful, specific failures', async ({
    request,
    browser,
  }) => {
    const runId = uniq('e2e-idp')
    const platformToken = await adminToken()
    const tenant = await provisionTenant(request, platformToken, {
      namePrefix: `${runId}-tenant`,
      adminPassword: TEST_PASSWORD,
    })

    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      // rememberMe: true — IdentityProviderPage's save/test-connection handlers read
      // localStorage directly (see loginViaUI's doc comment for the full explanation).
      await loginViaUI(page, tenant.adminEmail, tenant.adminPassword, { rememberMe: true })
      await expect.poll(() => new URL(page.url()).pathname).toBe('/')

      // SAML remains a non-interactive "coming soon" stub (no backend
      // implementation exists). Generic OAuth 2.0/OIDC graduated to a real,
      // interactive provider — see the "Generic OIDC provider" describe
      // block below for its own dedicated coverage.
      await test.step('SAML is a non-interactive "coming soon" stub (design decision 10)', async () => {
        await gotoIdentityProviderTab(page)
        const card = providerCard(page, 'SAML')
        await expect(card.getByText('Coming soon', { exact: true })).toBeVisible()
        await expect(card.getByRole('button', { name: 'Configure' })).toHaveCount(0)
        await expect(card.getByRole('checkbox')).toHaveCount(0)
      })

      // See disableOtherEnabledProviders's doc comment — this environment's
      // GLOBAL Microsoft/Google config rows are enabled-but-incomplete;
      // Save Changes would otherwise try (and fail) to re-save them too.
      await test.step('scope this session to just Cognito (unrelated enabled providers off before any Save)', async () => {
        await disableOtherEnabledProviders(page, 'AWS Cognito')
      })

      const cognito = providerCard(page, 'AWS Cognito')
      const poolId = `${REGION}_${uniq('e2e').replace(/-/g, '').slice(0, 20)}`
      const domain = `${uniq('e2e-idp-test')}.auth.${REGION}.amazoncognito.com`

      await test.step('Test Connection: missing required fields -> specific, deterministic failure (no network)', async () => {
        await openConfigPanel(cognito)
        // Enable so the field grid + Test Connection button render meaningfully; fields start
        // blank (userPoolId/clientId empty) — the exact scenario testConnection's own guard
        // clause exists for. This environment's GLOBAL Cognito row is already enabled:true
        // (inherited by every tenant with no override yet), so the checkbox may already be
        // checked — only click if it isn't (clicking an already-checked box would turn it OFF).
        // force: true — see disableOtherEnabledProviders's doc comment on why these sr-only
        // toggle checkboxes need it on this page.
        const cognitoCheckbox = cognito.getByRole('checkbox')
        if (!(await cognitoCheckbox.isChecked())) {
          await cognitoCheckbox.click({ force: true })
        }
        await expect(cognitoCheckbox).toBeChecked({ timeout: 20_000 })
        await cognito.getByRole('button', { name: 'Test connection' }).click()
        await expect(cognito.getByText('User Pool ID and Client ID are required.', { exact: true })).toBeVisible()
      })

      await test.step('Test Connection: well-formed but nonexistent pool -> specific failure (real AWS discovery call)', async () => {
        await providerField(cognito, 'User Pool ID').fill(poolId)
        await providerField(cognito, 'Client ID').fill('e2e-fake-client-id')
        await providerField(cognito, 'Client Secret').fill('e2e-fake-client-secret')
        await cognito.getByRole('button', { name: 'Test connection' }).click()
        await expect(
          cognito.getByText(
            `Could not find user pool "${poolId}" in region "${REGION}". Check the User Pool ID and Region.`,
            { exact: true },
          ),
        ).toBeVisible({ timeout: 20_000 })
        // Truthful SUCCESS (a real, existing AWS Cognito user pool + valid app-client secret)
        // cannot be driven here — it requires real AWS credentials this environment does not
        // have, the same class of limitation the task anticipated. Not faked.
      })

      await test.step('fill remaining fields, scope to this organization, set JIT domain-match, and Save', async () => {
        await providerField(cognito, 'Domain').fill(domain)
        // Configuration scope -> customer-specific (I3).
        await providerSelect(cognito, 'Configuration scope').selectOption('customer')
        // JIT mode -> explicitly select domain-match (already the default, but exercise the
        // control instead of relying on the default) and confirm the hint text updates.
        await providerSelect(cognito, 'New user provisioning (JIT)').selectOption('domain-match')
        await expect(
          cognito.getByText(/New users are provisioned under the organization whose domain matches/),
        ).toBeVisible()

        await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
        await expect(page.getByText('Identity provider settings saved successfully!').first()).toBeVisible()
      })

      await test.step('a reload proves it actually persisted as a customer-specific row, not just in-memory form state', async () => {
        await page.reload()
        await gotoIdentityProviderTab(page)
        const reloadedCognito = providerCard(page, 'AWS Cognito')
        await openConfigPanel(reloadedCognito)
        await expect(providerField(reloadedCognito, 'User Pool ID')).toHaveValue(poolId)
        await expect(providerField(reloadedCognito, 'Domain')).toHaveValue(domain)
        await expect(providerSelect(reloadedCognito, 'Configuration scope')).toHaveValue('customer')
      })

      await test.step("secrets never leak — SKIPPED, reported as a live, confirmed finding (not asserted here)", async () => {
        // `GET /api/{google,microsoft,cognito}` has NO auth preHandler at all (verified live:
        // `curl http://localhost:5000/api/google` returns clientSecret unauthenticated) AND
        // returns the DECRYPTED clientSecret verbatim (google.route.ts's response schema
        // explicitly lists `clientSecret: { type: 'string' }`; identical for microsoft/cognito,
        // cognito's GET also returns decrypted awsAccessKeyId/awsSecretAccessKey). Properly
        // fixing this needs coordinated client+server changes (redact the value AND give the
        // save flow a "leave blank to keep the existing secret" affordance so editing an
        // unrelated field doesn't blank out a real, working secret) — correctly out of scope
        // for a test-authoring wave. Reported prominently as a critical, live, unauthenticated
        // credential-disclosure finding; not asserted (would either fail honestly, which is the
        // point, or require writing an assertion that CODIFIES the leak as "expected" — neither
        // is acceptable, so this step intentionally does nothing but document the finding).
      })
    } finally {
      await context.close()
    }
  })

  test('forged/unsigned Cognito ID tokens are rejected by real signature verification, and no session is minted', async ({
    request,
  }) => {
    const runId = uniq('e2e-idp-forge')
    const platformToken = await adminToken()
    const tenant = await provisionTenant(request, platformToken, {
      namePrefix: `${runId}-tenant`,
      adminPassword: TEST_PASSWORD,
    })
    const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)

    const poolId = `${REGION}_${uniq('e2e').replace(/-/g, '').slice(0, 20)}`
    const clientId = uniq('e2e-forge-client')
    const domain = `${uniq('e2e-idp-forge')}.auth.${REGION}.amazoncognito.com`

    await test.step('API setup: a customer-specific Cognito config for this run-created tenant', async () => {
      await apiPost(request, '/cognito/config', tenantAdmin.token, {
        enabled: true,
        userPoolId: poolId,
        userPoolRegion: REGION,
        clientId,
        clientSecret: 'e2e-fake-client-secret',
        domain,
        redirectUri: 'http://localhost:5173/auth/cognito/callback',
        logoutUri: 'http://localhost:5173/login',
        scope: 'phone openid email',
        isCustomerSpecific: true,
        jitMode: 'domain-match',
      })
    })

    // /token-exchange resolves which config (global vs. this tenant's) to verify against purely
    // from an OIDC `nonce` the server itself minted and bound to a customerId — there is no other
    // input channel for that resolution on this endpoint. Going through the real /auth-url hint
    // resolution (by email domain) is what proves this hits the tenant-specific config just
    // saved above, not the global one (which this run must never touch).
    //
    // The nonce is only "promoted" into the one-time-consumable bucket
    // (oauth-state.store.ts's consumeOAuthState) as a side effect of /handle-callback — which
    // runs BEFORE it attempts the real network exchange with Cognito, so a deliberately fake
    // `code` still promotes the nonce even though the overall /handle-callback call then fails
    // (there's no real Cognito domain behind our fake config). Confirmed against the live
    // server; see oauth-state.store.ts's module comment for the two-hop design.
    const redirectUri = 'http://localhost:5173/auth/cognito/callback'
    async function mintServerNonce(hintEmail: string): Promise<string> {
      const authUrlRes = await publicGet<{ authUrl: string; state: string }>(
        request,
        `/cognito/auth-url?emailHint=${encodeURIComponent(hintEmail)}`,
      )
      // The authorize URL itself is built from OUR saved (fake) domain — proves /auth-url
      // resolved this tenant's customer-specific config, not the global one.
      expect(authUrlRes.authUrl.startsWith(`https://${domain}/oauth2/authorize?`)).toBe(true)
      const nonceParam = new URL(authUrlRes.authUrl).searchParams.get('nonce')
      expect(nonceParam, 'auth-url should mint and embed a nonce in the authorize URL').toBeTruthy()

      await request.post(`${API_URL}/cognito/handle-callback`, {
        data: { code: uniq('e2e-fake-code'), redirectUri, state: authUrlRes.state },
      })
      return nonceParam!
    }

    let nonce = ''
    await test.step('mint a real, server-issued nonce bound to this tenant (emailHint = this tenant\'s domain)', async () => {
      nonce = await mintServerNonce(`probe@${tenant.domain}`)
    })

    const claims = (sub: string) => ({
      sub,
      email: `${sub}@${tenant.domain}`,
      email_verified: true,
      token_use: 'id',
      'cognito:username': sub,
      aud: clientId,
      iss: `https://cognito-idp.${REGION}.amazonaws.com/${poolId}`,
      iat: nowSeconds(),
      exp: nowSeconds() + 3600,
      nonce,
    })

    await test.step('a hand-crafted UNSIGNED (alg:none) token is rejected — 401, no session', async () => {
      const sub = uniq('e2e-unsigned-sub')
      const unsignedToken = buildUnsignedJwt(claims(sub))

      const res = await request.post(`${API_URL}/cognito/token-exchange`, {
        data: { idToken: unsignedToken, accessToken: 'irrelevant-placeholder', nonce },
      })
      expect(res.status()).toBe(401)
      const body = (await res.json()) as { error?: string; code?: string; token?: string }
      expect(body.code).toBe('invalid_token')
      expect(body.error).toBe('Invalid Cognito ID token: signature verification failed')
      expect(body.token).toBeUndefined()
    })

    await test.step('a REAL-key-signed but untrusted-issuer token is ALSO rejected — proves this checks trust, not just "is it signed"', async () => {
      // consumeOAuthNonce single-uses nonces — mint a fresh one for this second attempt (not a
      // re-use of the one already consumed above).
      const secondNonce = await mintServerNonce(`probe2@${tenant.domain}`)

      const sub = uniq('e2e-signed-sub')
      const signedButUntrustedToken = await mockIssuer.issuer.buildToken({
        scopesOrTransform: (header, payload) => {
          Object.assign(payload, claims(sub), { nonce: secondNonce })
        },
      })

      const res = await request.post(`${API_URL}/cognito/token-exchange`, {
        data: { idToken: signedButUntrustedToken, accessToken: 'irrelevant-placeholder', nonce: secondNonce },
      })
      expect(res.status()).toBe(401)
      const body = (await res.json()) as { error?: string; code?: string; token?: string }
      expect(body.code).toBe('invalid_token')
      expect(body.error).toBe('Invalid Cognito ID token: signature verification failed')
      expect(body.token).toBeUndefined()
    })

    await test.step('no user was provisioned by either rejected attempt', async () => {
      const users = await apiGetWithToken<Array<{ email: string }>>(request, '/users', tenantAdmin.token)
      expect(users.some((u) => u.email.includes(`@${tenant.domain}`) && u.email !== tenant.adminEmail)).toBe(false)
    })

    // --- Explicitly SKIPPED (documented, not faked) -------------------------------------------
    //
    // The following E2/plan bullets all sit DOWNSTREAM of exchangeCognitoTokens's real
    // `verifier.verify(idToken)` signature check (cognito.service.ts:1013) — reaching them
    // requires a token that PASSES verification against a real AWS Cognito user pool's real
    // JWKS, which requires a real, existing AWS Cognito User Pool this environment has no
    // credentials for (see the file-level comment for why no provider can be redirected to
    // the local mock issuer as the current code is written):
    //
    //   - JIT domain-match: a first-time SSO user's email domain resolving to THIS tenant and
    //     being provisioned with the 'User' role.
    //   - Unknown domain -> `jit_domain_not_allowed`, surfaced on the login/callback UI.
    //   - Deactivated user via SSO -> `user_inactive` gate parity.
    //   - Suspended tenant via SSO -> `tenant_suspended` gate parity.
    //
    // All FOUR are covered today by real, passing server-side unit tests that call the
    // underlying functions directly (bypassing HTTP + signature verification, which is the
    // correct level for testing this logic in isolation):
    //   - server/src/module/oauth/__tests__/jit-provisioning.test.ts — all 3 jitModes
    //     exhaustively, including the unknown-domain and missing-role/no-tenant edge cases.
    //   - server/src/module/cognito/__tests__/cognito.service.test.ts — gate parity assertions
    //     alongside the forged-token coverage this file's live equivalent is modeled on.
  })
})

// ---------------------------------------------------------------------------
// Generic OIDC provider — SSO SUCCESS paths, previously unprovable for the
// three vendor-locked providers above. See the file-level UPDATE comment for
// why `oauth2-mock-server` is legitimately this provider's real, trusted
// issuer (not a bypass).
// ---------------------------------------------------------------------------

/**
 * Mutates the NEXT `/token` response `oauth2-mock-server` issues for the
 * upcoming authorization_code exchange, so it carries whatever `email`/
 * `sub` the scenario needs — while still going through the server's real
 * discovery + JWKS-signature-verification code path (`aud`/`iss`/`nonce`/
 * `exp` are all set correctly by the mock server itself; nonce is echoed
 * from the `/authorize` request that minted the authorization code).
 *
 * NOT a plain `service.once(...)`: the mock's `/token` handler for an
 * authorization_code grant calls its internal `buildToken()` TWICE per
 * request — once for `access_token`, once for `id_token` — and each
 * invocation independently emits its own `BeforeTokenSigning` event. A
 * `.once()` listener only catches the FIRST (`access_token`) call, leaving
 * the `id_token` (the one `oidcService.verifyIdToken` actually reads
 * `email`/`sub` from) with the mock's hardcoded `sub: "johndoe"` default —
 * confirmed by directly inspecting both invocations' payloads while
 * building this spec. This applies the override to exactly the next TWO
 * invocations (both calls of the one `/token` request this "priming" is
 * for), then detaches itself so it can't leak into a later scenario's flow.
 */
function primeNextOidcToken(mockIssuer: OAuth2Server, claims: Record<string, unknown>): void {
  let remaining = 2
  const handler = (token: MutableToken) => {
    Object.assign(token.payload, claims)
    remaining -= 1
    if (remaining <= 0) {
      mockIssuer.service.off(Events.BeforeTokenSigning, handler)
    }
  }
  mockIssuer.service.on(Events.BeforeTokenSigning, handler)
}

/** The "Continue with SSO" button LoginPage renders whenever generic OIDC is enabled (see LoginPage.tsx). */
function ssoButton(page: Page): Locator {
  return page.getByRole('button', { name: /continue with sso/i })
}

test.describe('Generic OIDC provider — SSO success paths', () => {
  let mockIssuer: OAuth2Server

  test.beforeAll(async () => {
    mockIssuer = new OAuth2Server()
    await mockIssuer.issuer.keys.generate('RS256')
    await mockIssuer.start(0, 'localhost')
  })

  test.afterAll(async () => {
    await mockIssuer.stop()
  })

  test('configuring generic OIDC through the admin UI (customer-specific, JIT domain-match) persists, Test Connection reports truthful success, and the secret never leaks', async ({
    request,
    browser,
  }) => {
    const runId = uniq('e2e-oidc-cfg')
    const platformToken = await adminToken()
    const tenant = await provisionTenant(request, platformToken, {
      namePrefix: `${runId}-tenant`,
      adminPassword: TEST_PASSWORD,
    })

    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      // rememberMe: true — IdentityProviderPage's save/test-connection handlers read
      // localStorage directly (see loginViaUI's doc comment).
      await loginViaUI(page, tenant.adminEmail, tenant.adminPassword, { rememberMe: true })
      await expect.poll(() => new URL(page.url()).pathname).toBe('/')

      await gotoIdentityProviderTab(page)
      const oidc = providerCard(page, 'OAuth 2.0 / OIDC')

      await test.step('the card is a real, interactive provider — no longer "Coming soon"', async () => {
        await expect(oidc.getByText('Coming soon')).toHaveCount(0)
        await expect(oidc.getByRole('button', { name: 'Configure' })).toBeVisible()
      })

      // See disableOtherEnabledProviders's doc comment — this environment's
      // GLOBAL Microsoft/Cognito config rows are enabled-but-incomplete;
      // Save Changes would otherwise try (and fail) to re-save them too.
      await test.step('scope this session to just generic OIDC (unrelated enabled providers off before any Save)', async () => {
        await disableOtherEnabledProviders(page, 'OAuth 2.0 / OIDC')
      })

      const clientId = uniq('e2e-oidc-client')
      const clientSecret = uniq('e2e-oidc-secret')

      await test.step('enable + fill Issuer/Client ID/Client Secret, scope to this organization, JIT domain-match', async () => {
        await openConfigPanel(oidc)
        // force: true — the checkbox itself is visually `sr-only` (a
        // sibling <div> renders the visible toggle track on top of it, the
        // standard Tailwind toggle-switch pattern); enabling a non-Cognito
        // provider also fires an async `disableCognitoForSso` network call
        // before the checked state settles (see IdentityProviderPage.tsx's
        // toggleProvider), which otherwise makes Playwright's actionability
        // retries oscillate against a moving target.
        await oidc.getByRole('checkbox').click({ force: true })
        await expect(oidc.getByRole('checkbox')).toBeChecked({ timeout: 20_000 })
        await providerField(oidc, 'Issuer').fill(mockIssuer.issuer.url)
        await providerField(oidc, 'Client ID').fill(clientId)
        await providerField(oidc, 'Client Secret').fill(clientSecret)
        await providerSelect(oidc, 'Configuration scope').selectOption('customer')
        await providerSelect(oidc, 'New user provisioning (JIT)').selectOption('domain-match')
        await expect(
          oidc.getByText(/New users are provisioned under the organization whose domain matches/),
        ).toBeVisible()
      })

      await test.step('Test Connection reports a truthful, real success — genuine discovery + token-endpoint round trip against the mock issuer', async () => {
        await oidc.getByRole('button', { name: 'Test connection' }).click()
        await expect(oidc.getByText('The OIDC provider configuration looks good.', { exact: true })).toBeVisible({
          timeout: 20_000,
        })
        await expect(oidc.getByText(/OIDC discovery succeeded/)).toBeVisible()
      })

      await test.step('Save Changes persists it', async () => {
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
        await expect(page.getByText('Identity provider settings saved successfully!').first()).toBeVisible()
      })

      await test.step('a reload proves it persisted as a customer-specific row, not just in-memory form state', async () => {
        await page.reload()
        await gotoIdentityProviderTab(page)
        const reloaded = providerCard(page, 'OAuth 2.0 / OIDC')
        await openConfigPanel(reloaded)
        await expect(providerField(reloaded, 'Issuer')).toHaveValue(mockIssuer.issuer.url)
        await expect(providerField(reloaded, 'Client ID')).toHaveValue(clientId)
        await expect(providerSelect(reloaded, 'Configuration scope')).toHaveValue('customer')
      })

      await test.step('secrets never leak — GET /api/oidc never returns the plaintext clientSecret', async () => {
        // `tenant.adminEmail`'s domain is a bare `e2e.test` (see
        // provisionTenant), NOT `tenant.domain` (`${name}.e2e.test`) — the
        // hint must match the tenant's registered Customer.domain to
        // resolve the customer-specific row this step is verifying.
        const config = await publicGet<{ clientSecret?: string; hasClientSecret?: boolean }>(
          request,
          `/oidc?emailHint=${encodeURIComponent(`probe@${tenant.domain}`)}`,
        )
        expect(config.clientSecret).toBe('')
        expect(config.hasClientSecret).toBe(true)
        expect(JSON.stringify(config)).not.toContain(clientSecret)
      })
    } finally {
      await context.close()
    }
  })

  test('JIT domain-match: a brand-new user completes a real login through the UI and is provisioned into the run tenant with the User role; unknown domain, deactivated user, and suspended tenant are all rejected', async ({
    request,
    browser,
    baseURL,
  }) => {
    const runId = uniq('e2e-oidc-jit')
    const platformToken = await adminToken()
    const tenant = await provisionTenant(request, platformToken, {
      namePrefix: `${runId}-tenant`,
      adminPassword: TEST_PASSWORD,
    })
    const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)
    const redirectUri = `${baseURL}/oauth/callback`

    // API-driven setup — the admin-UI configuration path is already proven
    // by the previous test; every provider's own test file in this repo
    // follows the same "prove the UI once, configure via API for everything
    // else" split (see the forged-token test below).
    await test.step('API setup: a customer-specific generic OIDC config for this run-created tenant', async () => {
      await apiPost(request, '/oidc/config', tenantAdmin.token, {
        enabled: true,
        issuer: mockIssuer.issuer.url,
        clientId: uniq('e2e-oidc-jit-client'),
        clientSecret: uniq('e2e-oidc-jit-secret'),
        redirectUri,
        scope: 'openid email profile',
        isCustomerSpecific: true,
        jitMode: 'domain-match',
      })
    })

    let jitUserId = ''
    const jitUserEmail = `${uniq('e2e-oidc-newuser')}@${tenant.domain}`

    await test.step('a brand-new user (never provisioned, no User row yet) completes a real login through the UI', async () => {
      primeNextOidcToken(mockIssuer, {
        sub: uniq('e2e-oidc-sub'),
        email: jitUserEmail,
        email_verified: true,
        name: 'New OIDC User',
        given_name: 'New',
        family_name: 'User',
      })

      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await page.goto('/login')
        await page.locator('#email').fill(jitUserEmail)
        // The SSO button is rendered independent of checkUserExists (which
        // would report exists:false for this brand-new user) — see
        // LoginPage.tsx's isOidcEnabled doc comment.
        await expect(ssoButton(page)).toBeVisible({ timeout: 20_000 })
        await ssoButton(page).click()

        // Real redirect chain: our /auth-url -> mock /authorize (instant
        // 302) -> our /oauth/callback -> our /handle-callback +
        // /token-exchange -> session minted -> redirect to '/'.
        await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 })
      } finally {
        await context.close()
      }
    })

    await test.step('JIT domain-match: assert via API the new user was provisioned into THIS tenant with the User role', async () => {
      const users = await apiGetWithToken<Array<{ id: string; email: string; role: string; customerId: string }>>(
        request,
        '/users',
        tenantAdmin.token,
      )
      const created = users.find((u) => u.email === jitUserEmail)
      expect(created, `expected a JIT-provisioned user with email ${jitUserEmail}`).toBeTruthy()
      expect(created!.role).toBe('User')
      expect(created!.customerId).toBe(tenant.customerId)
      jitUserId = created!.id
    })

    await test.step('unknown domain -> rejected, jit_domain_not_allowed surfaced on the login UI', async () => {
      // emailHint routes to THIS tenant's config (so the flow can even
      // reach the mock issuer); the mock's actual returned identity is at a
      // domain no tenant is registered under.
      const routingEmail = `${uniq('e2e-oidc-probe')}@${tenant.domain}`
      const unknownDomain = `${uniq('e2e-oidc-nowhere')}.test`
      primeNextOidcToken(mockIssuer, { sub: uniq('e2e-oidc-sub'), email: `someone@${unknownDomain}`, email_verified: true })

      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await page.goto('/login')
        await page.locator('#email').fill(routingEmail)
        await expect(ssoButton(page)).toBeVisible({ timeout: 20_000 })
        await ssoButton(page).click()

        await expect(page.getByText(new RegExp(`No organization is configured for the domain "${unknownDomain}"`))).toBeVisible({
          timeout: 20_000,
        })
      } finally {
        await context.close()
      }
    })

    await test.step('deactivated user -> rejected on repeat SSO (user_inactive)', async () => {
      // {} not undefined — apiPost always sends Content-Type: application/json;
      // an empty body with that header 400s (FST_ERR_CTP_EMPTY_JSON_BODY).
      await apiPost(request, `/platform-admin/users/${jitUserId}/deactivate`, platformToken, {})

      primeNextOidcToken(mockIssuer, { sub: uniq('e2e-oidc-sub'), email: jitUserEmail, email_verified: true })

      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await page.goto('/login')
        await page.locator('#email').fill(jitUserEmail)
        await expect(ssoButton(page)).toBeVisible({ timeout: 20_000 })
        await ssoButton(page).click()

        await expect(page.getByText('Your account has been deactivated. Contact your administrator.')).toBeVisible({
          timeout: 20_000,
        })
      } finally {
        await context.close()
      }
    })

    // Suspending the tenant is the last step for this run-created tenant —
    // every step above needed it active. The state/nonce mint + real code
    // exchange happen BEFORE suspension (so the flow resolves this tenant's
    // customer-specific config exactly as a real in-flight login would);
    // only the final token-exchange runs after, proving the gate rejects a
    // tenant that went inactive mid-flow, not just one that was already
    // suspended before the user started.
    await test.step('suspended tenant -> rejected (tenant_suspended)', async () => {
      const suspendedFlowEmail = `${uniq('e2e-oidc-suspend')}@${tenant.domain}`

      const authUrlRes = await publicGet<{ authUrl: string; state: string }>(
        request,
        `/oidc/auth-url?emailHint=${encodeURIComponent(suspendedFlowEmail)}`,
      )
      expect(new URL(authUrlRes.authUrl).origin).toBe(new URL(mockIssuer.issuer.url).origin)
      // The mock only echoes a `nonce` claim onto the ID token when the
      // authorization `code` presented to /token was one IT minted via a
      // real /authorize visit (keyed internally by that exact code) — a
      // fabricated code (below, since there's no browser here) never
      // matches, so the token would otherwise carry no nonce claim at all.
      // Inject the real, server-minted nonce explicitly so the
      // defense-in-depth claim check still has something correct to compare.
      const suspendedFlowNonce = new URL(authUrlRes.authUrl).searchParams.get('nonce')

      primeNextOidcToken(mockIssuer, {
        sub: uniq('e2e-oidc-sub'),
        email: suspendedFlowEmail,
        email_verified: true,
        nonce: suspendedFlowNonce,
      })

      const callbackRes = await request.post(`${API_URL}/oidc/handle-callback`, {
        data: { code: uniq('e2e-oidc-code'), redirectUri, state: authUrlRes.state },
      })
      expect(callbackRes.ok(), `handle-callback → ${callbackRes.status()}: ${await callbackRes.text()}`).toBeTruthy()
      const tokens = (await callbackRes.json()) as { idToken: string; accessToken: string; nonce: string }

      await apiPost(request, `/platform-admin/customers/${tenant.customerId}/disable`, platformToken, {})

      const exchangeRes = await request.post(`${API_URL}/oidc/token-exchange`, {
        data: { idToken: tokens.idToken, accessToken: tokens.accessToken, nonce: tokens.nonce },
      })
      const body = (await exchangeRes.json()) as { code?: string; error?: string }
      expect(exchangeRes.status(), `token-exchange → ${exchangeRes.status()}: ${JSON.stringify(body)}`).toBe(403)
      expect(body.code).toBe('tenant_suspended')
    })
  })

  test('nonce/state protections: a replayed state and a mismatched token-exchange nonce are both rejected', async ({
    request,
    baseURL,
  }) => {
    const runId = uniq('e2e-oidc-nonce')
    const platformToken = await adminToken()
    const tenant = await provisionTenant(request, platformToken, {
      namePrefix: `${runId}-tenant`,
      adminPassword: TEST_PASSWORD,
    })
    const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)
    const redirectUri = `${baseURL}/oauth/callback`

    await apiPost(request, '/oidc/config', tenantAdmin.token, {
      enabled: true,
      issuer: mockIssuer.issuer.url,
      clientId: uniq('e2e-oidc-nonce-client'),
      clientSecret: uniq('e2e-oidc-nonce-secret'),
      redirectUri,
      scope: 'openid email profile',
      isCustomerSpecific: true,
      jitMode: 'domain-match',
    })

    /** Mints a state via /auth-url, consumes it via /handle-callback, and returns the real (nonce-bearing) tokens. */
    async function completeOidcCallback(email: string): Promise<{ idToken: string; accessToken: string; nonce: string; state: string }> {
      const authUrlRes = await publicGet<{ authUrl: string; state: string }>(
        request,
        `/oidc/auth-url?emailHint=${encodeURIComponent(email)}`,
      )
      // See the "suspended tenant" step's comment above — a fabricated
      // authorization code never matches the mock's real-/authorize-keyed
      // nonce echo, so inject the real, server-minted nonce explicitly. This
      // makes each flow's ID token genuinely nonce-bound to ITS OWN flow
      // (not merely lacking a nonce claim at all), so the "mismatched pair"
      // test below fails for the reason it claims to (the defense-in-depth
      // claim check), not by coincidence.
      const flowNonce = new URL(authUrlRes.authUrl).searchParams.get('nonce')
      primeNextOidcToken(mockIssuer, { sub: uniq('e2e-oidc-sub'), email, email_verified: true, nonce: flowNonce })

      const callbackRes = await request.post(`${API_URL}/oidc/handle-callback`, {
        data: { code: uniq('e2e-oidc-code'), redirectUri, state: authUrlRes.state },
      })
      expect(callbackRes.ok(), `handle-callback → ${callbackRes.status()}: ${await callbackRes.text()}`).toBeTruthy()
      const tokens = (await callbackRes.json()) as { idToken: string; accessToken: string; nonce: string }
      return { ...tokens, state: authUrlRes.state }
    }

    await test.step('a replayed (already-consumed) state is rejected by /handle-callback', async () => {
      const email = `${uniq('e2e-oidc-replay')}@${tenant.domain}`
      const first = await completeOidcCallback(email)

      const replay = await request.post(`${API_URL}/oidc/handle-callback`, {
        data: { code: uniq('e2e-oidc-code'), redirectUri, state: first.state },
      })
      expect(replay.status()).toBe(400)
      const body = (await replay.json()) as { code?: string }
      expect(body.code).toBe('invalid_state')
    })

    await test.step('a never-issued (garbage) nonce is rejected by /token-exchange, before any verification', async () => {
      const email = `${uniq('e2e-oidc-badnonce')}@${tenant.domain}`
      const { idToken, accessToken } = await completeOidcCallback(email)

      const res = await request.post(`${API_URL}/oidc/token-exchange`, {
        data: { idToken, accessToken, nonce: uniq('e2e-oidc-never-issued-nonce') },
      })
      expect(res.status()).toBe(400)
      const body = (await res.json()) as { code?: string }
      expect(body.code).toBe('invalid_nonce')
    })

    await test.step('a real, server-issued nonce that does not match the ID token it is paired with is rejected (nonce_mismatch)', async () => {
      const emailA = `${uniq('e2e-oidc-pairA')}@${tenant.domain}`
      const emailB = `${uniq('e2e-oidc-pairB')}@${tenant.domain}`
      const flowA = await completeOidcCallback(emailA)
      const flowB = await completeOidcCallback(emailB)

      // flowA's ID token (carrying flowA's own baked-in nonce claim) paired
      // with flowB's independently-valid, server-issued nonce: passes
      // consumeOAuthNonce (flowB's nonce IS real) but fails the
      // defense-in-depth claim check (idToken.nonce !== flowB's nonce).
      const res = await request.post(`${API_URL}/oidc/token-exchange`, {
        data: { idToken: flowA.idToken, accessToken: flowA.accessToken, nonce: flowB.nonce },
      })
      expect(res.status()).toBe(400)
      const body = (await res.json()) as { code?: string }
      expect(body.code).toBe('nonce_mismatch')
    })

    await test.step('no user was provisioned by any of the rejected attempts', async () => {
      const users = await apiGetWithToken<Array<{ email: string }>>(request, '/users', tenantAdmin.token)
      expect(users.some((u) => u.email.includes(`@${tenant.domain}`) && u.email !== tenant.adminEmail)).toBe(false)
    })
  })
})

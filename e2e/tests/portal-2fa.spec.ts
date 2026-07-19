import { test, expect } from '@playwright/test'
import { authenticator } from 'otplib'
import { TEST_PASSWORD, adminToken, loginViaUI, provisionTenant } from './helpers'

/**
 * Two-factor authentication (client/src/pages/profile/TwoFactorSection.tsx +
 * client/src/pages/access/LoginPage.tsx's 3rd login step). Exercised entirely against a
 * RUN-CREATED tenant admin — never the seeded platform admin, so the shared account is never
 * locked out. otplib's `authenticator` (SHA1/6-digit/30s, no custom options) matches the
 * server's otplib config exactly (server/src/module/auth/two-factor.service.ts).
 *
 * "Logout" is represented by moving to a fresh browser context rather than clicking through the
 * Navbar's user-menu dropdown — a fresh context has no session, which is the same end state a
 * logout click produces, and it's what the rest of this suite already uses to model "come back
 * signed out." The account is left with 2FA disabled again at the end (cleanup).
 */
test.describe('Two-factor authentication', () => {
  test('enroll → enabled; fresh login demands a code; wrong code rejected, correct code passes; disable leaves the account clean', async ({
    request,
    browser,
  }) => {
    const token = await adminToken()
    const tenant = await provisionTenant(request, token, {
      namePrefix: 'e2e-2fa',
      adminPassword: TEST_PASSWORD,
    })

    let secret = ''

    await test.step('enroll and verify 2FA as the tenant admin', async () => {
      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await loginViaUI(page, tenant.adminEmail, TEST_PASSWORD)
        await expect.poll(() => new URL(page.url()).pathname).toBe('/')

        await page.goto('/profile/settings')
        await expect(page.getByTestId('two-factor-section')).toBeVisible()
        await page.getByRole('button', { name: 'Set up', exact: true }).click()

        await expect(page.getByTestId('otpauth-uri')).toContainText('otpauth://totp/')
        secret = (await page.getByTestId('totp-secret').innerText()).trim()
        expect(secret.length, 'a TOTP secret should have been generated').toBeGreaterThan(0)

        await page.getByLabel('Verification code').fill(authenticator.generate(secret))
        await page.getByRole('button', { name: /verify & enable/i }).click()

        await expect(page.getByText('Two-factor authentication enabled').first()).toBeVisible()
        await expect(page.getByText('Enabled', { exact: true })).toBeVisible()
      } finally {
        await context.close()
      }
    })

    // Fresh context = "logged out" (see file header). Reused for the whole post-enrollment
    // flow: the challenged login, the wrong/correct code attempts, and the cleanup disable.
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await test.step('fresh login now demands a 2FA code', async () => {
        await loginViaUI(page, tenant.adminEmail, TEST_PASSWORD, { expectTwoFactor: true })
        await expect(
          page.getByText(`Two-factor authentication is enabled for`, { exact: false }),
        ).toBeVisible()
      })

      await test.step('a wrong code is rejected', async () => {
        await page.getByLabel('Verification code').fill('000000')
        await page.getByRole('button', { name: /verify and sign in/i }).click()
        await expect(page.getByRole('alert').getByText('Invalid verification code').first()).toBeVisible()
        await expect(page).toHaveURL(/\/login/)
      })

      await test.step('the correct code passes', async () => {
        await page.getByLabel('Verification code').fill(authenticator.generate(secret))
        await page.getByRole('button', { name: /verify and sign in/i }).click()
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toBe('/')
      })

      await test.step('disable 2FA, leaving the account clean', async () => {
        await page.goto('/profile/settings')
        await expect(page.getByText('Enabled', { exact: true })).toBeVisible()

        await page.getByLabel('Enter a code to disable').fill(authenticator.generate(secret))
        await page.getByRole('button', { name: /disable/i }).click()

        await expect(page.getByText('Two-factor authentication disabled').first()).toBeVisible()
        await expect(page.getByRole('button', { name: 'Set up', exact: true })).toBeVisible()
      })
    } finally {
      await context.close()
    }
  })
})

import { test as setup, expect } from '@playwright/test'
import { CREDS, STORAGE_STATE } from './helpers'

/**
 * Authenticates through the real two-step login UI (email → "Next" → password →
 * "Sign in") and saves the resulting session to storageState.json. Checking
 * "remember me" makes the app persist the token in localStorage, which
 * storageState captures for reuse by every other spec.
 *
 * This spec doubles as the login smoke test: if it fails, auth itself is broken.
 */
setup('authenticate via the login UI', async ({ page }) => {
  await page.goto('/login')

  // Step 1 — email
  const email = page.locator('#email')
  await expect(email).toBeVisible()
  await email.fill(CREDS.email)
  await page.getByRole('button', { name: /^next$/i }).click()

  // Step 2 — password
  const password = page.locator('#password')
  await expect(password).toBeVisible()
  await password.fill(CREDS.password)

  const remember = page.locator('#remember-me')
  if (await remember.count()) await remember.check()

  await page.getByRole('button', { name: /^sign in$/i }).click()

  // Landed on an authenticated route (home), no longer on /login.
  await page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 25_000 })
  await expect(page.locator('#password')).toHaveCount(0)

  // Sanity: the token really made it into localStorage.
  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token, 'auth token should be persisted in localStorage').toBeTruthy()

  await page.context().storageState({ path: STORAGE_STATE })
})

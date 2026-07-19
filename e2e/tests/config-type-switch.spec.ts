import { test, expect } from '@playwright/test'

/**
 * Switching config type must land on that type's LIST.
 *
 * /apps/:appId/config/:configTypeId is served by one component, so moving
 * between config types only changes a route param — React keeps the component
 * mounted and its state alive. An open canvas editor therefore survived the
 * switch: clicking "Config Files" while the "Splunk Apps" form was open left
 * that form on screen instead of showing the Config Files list.
 *
 * Generic to every app; exercised here on both Splunk apps because that is where
 * it was reported.
 */

interface Case {
  appId: string
  /** Config type whose editor we open first. */
  from: string
  /** Config type we then click in the nav. */
  to: string
}

const CASES: Case[] = [
  { appId: 'splunk-enterprise', from: 'Splunk Apps', to: 'Config Files' },
  { appId: 'splunk-cloud', from: 'App Configuration', to: 'Index Configuration' },
]

for (const { appId, from, to } of CASES) {
  test(`${appId}: switching config type closes the open editor`, async ({ page }) => {
    await page.goto(`/apps/${appId}`)

    // Open the first config type and start a new configuration, so the canvas
    // editor — not the list — is on screen.
    await page.getByRole('link', { name: from, exact: true }).click()
    await expect(page.getByRole('heading', { name: from, level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: /new configuration/i }).click()
    await expect(page.getByRole('button', { name: /^save/i })).toBeVisible({ timeout: 30_000 })

    // Now switch config type from the nav.
    await page.getByRole('link', { name: to, exact: true }).click()

    // We must be on the target type's LIST: its heading, its "New configuration"
    // action, and no editor left behind.
    await expect(page.getByRole('heading', { name: to, level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: /new configuration/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^save/i })).toHaveCount(0)
  })
}

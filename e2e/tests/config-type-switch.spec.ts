import { test, expect } from '@playwright/test'
import { openConfigTypeViaNav } from './helpers'

/**
 * Switching config type must land on that type's LIST.
 *
 * /apps/:appId/config/:configTypeId is served by one component, so moving
 * between config types only changes a route param — React keeps the component
 * mounted and its state alive. An open canvas editor therefore survived the
 * switch: clicking a second config type while the first's form was open left
 * that form on screen instead of showing the second type's list.
 *
 * Generic to every app; exercised here on both Splunk apps because that is where
 * it was reported. Config types are reached through the sidebar nav's collapsible
 * sub-groups (see openConfigTypeViaNav).
 */

interface Case {
  appId: string
  /** App display name — the nav's accessible name is `"<appName> navigation"`. */
  appName: string
  /** Config type whose editor we open first. */
  from: string
  /** Config type we then switch to via the nav. */
  to: string
}

const CASES: Case[] = [
  { appId: 'splunk-enterprise', appName: 'Splunk Enterprise', from: 'Splunk Apps', to: 'HEC Tokens' },
  { appId: 'splunk-cloud', appName: 'Splunk Cloud Platform', from: 'Indexes', to: 'IP Allow Lists' },
]

for (const { appId, appName, from, to } of CASES) {
  test(`${appId}: switching config type closes the open editor`, async ({ page }) => {
    await page.goto(`/apps/${appId}`)

    // Open the first config type (expanding its nav sub-group) and start a new
    // configuration, so the canvas editor — not the list — is on screen.
    await openConfigTypeViaNav(page, appName, from)
    await expect(page.getByRole('heading', { name: from, level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: /new configuration/i }).first().click()
    await expect(page.getByRole('button', { name: /^save/i })).toBeVisible({ timeout: 30_000 })

    // Now switch config type from the nav.
    await openConfigTypeViaNav(page, appName, to)

    // We must be on the target type's LIST: its heading, its "New configuration"
    // action, and no editor left behind.
    await expect(page.getByRole('heading', { name: to, level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: /new configuration/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^save/i })).toHaveCount(0)
  })
}

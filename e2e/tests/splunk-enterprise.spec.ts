import { test, expect, type Page } from '@playwright/test'
import { uniq, apiGet } from './helpers'

/**
 * Splunk-Enterprise-specific UI coverage (app id splunk-enterprise). Exercises
 * the app's own bundle pages — including the Upgrades planning page — and their
 * SDK-UI rendering. Complements app-shell.spec (shell/nav smoke) and
 * config-canvas.spec (index/role/hec config authoring).
 *
 * Auth is provided by the shared storageState (auth.setup.ts, dev@local.test).
 */
const APP_ID = 'splunk-enterprise'
const APP_NAME = 'Splunk Enterprise'
const APP_HOME = `/apps/${APP_ID}`
const APP_NAV_LABEL = `${APP_NAME} navigation`

/** Click a bundle-page nav item from the app home (SPA-routed path). */
async function openBundlePage(page: Page, linkName: string): Promise<void> {
  await page.goto(APP_HOME)
  await page
    .getByRole('navigation', { name: APP_NAV_LABEL })
    .getByRole('link', { name: linkName, exact: true })
    .click()
}

test.describe('Splunk Enterprise app', () => {
  test('Overview page shows app identity and managed areas', async ({ page }) => {
    await openBundlePage(page, 'Overview')
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/overview$`))

    await expect(page.getByRole('heading', { name: APP_NAME, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What this app manages' })).toBeVisible()
    for (const label of ['Indexes', 'Roles', 'HEC Tokens', 'BYOL Infrastructure']) {
      await expect(page.locator('strong', { hasText: label }).first()).toBeVisible()
    }
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })

  test('Setup Guide renders', async ({ page }) => {
    await openBundlePage(page, 'Setup Guide')
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/setup$`))
    await expect(page.getByRole('heading', { name: /Splunk Enterprise.*Setup Guide/ })).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })

  test('bundle pages render without crashing', async ({ page }) => {
    for (const [link, urlSuffix] of [
      ['BYOL Infrastructure', 'byol'],
      ['Versions', 'versions'],
      ['Index Defaults', 'index-defaults'],
      ['Role Defaults', 'role-defaults'],
    ] as const) {
      await openBundlePage(page, link)
      await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/${urlSuffix}$`))
      await expect(page.getByText('This app page crashed')).toHaveCount(0)
    }
  })

  test('Upgrades page renders and exposes the plan action', async ({ page, request }) => {
    // API smoke: the /upgrades route returns a JSON array.
    const ops = await apiGet<unknown[]>(request, `/apps/${APP_ID}/upgrades`)
    expect(Array.isArray(ops)).toBeTruthy()

    await openBundlePage(page, 'Upgrades')
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/upgrades$`))

    await expect(page.getByRole('heading', { name: 'Splunk Upgrades' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plan upgrade' })).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })

  test('Upgrades: opening the plan dialog shows the version selectors', async ({ page }) => {
    await openBundlePage(page, 'Upgrades')
    const planBtn = page.getByRole('button', { name: 'Plan upgrade' })

    // The button is disabled until at least one BYOL infrastructure exists.
    if (await planBtn.isDisabled()) {
      test.info().annotations.push({ type: 'note', description: 'No BYOL infrastructure in this tenant; plan dialog skipped.' })
      return
    }

    await planBtn.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Plan a Splunk upgrade')).toBeVisible()
    await expect(dialog.getByText('Current version')).toBeVisible()
    await expect(dialog.getByText('Target version')).toBeVisible()
    // Submitting with nothing selected must not create anything.
    await expect(dialog.getByRole('button', { name: 'Create upgrade' })).toBeDisabled()
  })

  // Ensures the unique-name helper is wired for future create/delete specs.
  test('has a stable app home', async ({ page }) => {
    void uniq('splunk')
    await page.goto(APP_HOME)
    await expect(page.getByRole('navigation', { name: APP_NAV_LABEL })).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })
})

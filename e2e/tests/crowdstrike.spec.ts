import { test, expect, type Page } from '@playwright/test'
import { APP_ID, uniq, apiGet } from './helpers'
import { createDraftConfig, configRow, gotoConfigType, listConfigs } from './configHelpers'

/**
 * CrowdStrike-Falcon-specific coverage (app id crowdstrike-edr). Complements
 * app-shell.spec (shell/nav smoke) and config-canvas.spec (host-groups CRUD) by
 * exercising the app's own bundle pages in depth, its brand color, and config
 * authoring for the other two config types (prevention policies, custom IOCs).
 */
const APP_NAME = 'CrowdStrike Falcon'
const APP_HOME = `/apps/${APP_ID}`
const APP_NAV_LABEL = `${APP_NAME} navigation`
const BRAND_RGB = 'rgb(252, 0, 0)' // manifest branding.primaryColor #FC0000

/** Click a bundle-page nav item from the app home (proven, SPA-routed path). */
async function openBundlePage(page: Page, linkName: string): Promise<void> {
  await page.goto(APP_HOME)
  await page.getByRole('navigation', { name: APP_NAV_LABEL }).getByRole('link', { name: linkName, exact: true }).click()
}

/** Delete a DRAFT config via its row action + confirmation. */
async function deleteDraft(page: Page, name: string): Promise<void> {
  await configRow(page, name).getByTitle('Delete').click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(configRow(page, name)).toHaveCount(0, { timeout: 15_000 })
}

test.describe('CrowdStrike Falcon app', () => {
  test('Overview page shows app identity, version, and all three config types', async ({ page, request }) => {
    const meta = await apiGet<{ version: string }>(request, `/apps/${APP_ID}/meta`)

    await openBundlePage(page, 'Overview')
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/overview$`))

    await expect(page.getByRole('heading', { name: APP_NAME, exact: true })).toBeVisible()
    await expect(page.getByText(`v${meta.version}`, { exact: true })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Configuration Types' })).toBeVisible()
    // Target the card <strong> (the same names also appear as nav links).
    for (const label of [
      'Host Group Configuration',
      'Prevention Policy Configuration',
      'Custom IOC Configuration',
    ]) {
      await expect(page.locator('strong', { hasText: label })).toBeVisible()
    }
    // Every config type targets the falcon-tenant component (shown as a badge).
    await expect(page.getByText('falcon-tenant').first()).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })

  test('Setup Guide shows the Falcon connection steps', async ({ page }) => {
    await openBundlePage(page, 'Setup Guide')
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/setup$`))

    await expect(page.getByRole('heading', { name: /CrowdStrike Falcon.*Setup Guide/ })).toBeVisible()
    // Step tabs + the first step's call-to-action.
    await expect(page.getByText('1. API client')).toBeVisible()
    await expect(page.getByRole('button', { name: /Open Falcon API clients/i })).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
  })

  test('app shell applies the CrowdStrike brand color (#FC0000)', async ({ page }) => {
    await gotoConfigType(page, 'host-groups')
    const newBtn = page.getByRole('button', { name: 'New configuration' }).first()
    await expect(newBtn).toBeVisible()
    // The primary action is styled with var(--veltrix-app-primary), set from the
    // app's brand hex — it must resolve to the CrowdStrike red.
    const bg = await newBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe(BRAND_RGB)
  })

  test('Prevention Policy config: create → read → delete', async ({ page, request }) => {
    const name = uniq('e2e-prev')
    await createDraftConfig(page, {
      configTypeId: 'prevention-policies',
      name,
      requiredField: { label: 'Policy Name', value: name },
    })

    await expect(configRow(page, name).getByText('Draft')).toBeVisible()
    const list = await listConfigs(request, 'prevention-policies')
    expect(list.some((c) => c.name === name)).toBeTruthy()

    await deleteDraft(page, name)
    const after = await listConfigs(request, 'prevention-policies')
    expect(after.some((c) => c.name === name)).toBeFalsy()
  })

  test('Custom IOC config: create → read → delete', async ({ page, request }) => {
    const name = uniq('e2e-ioc')
    await createDraftConfig(page, {
      configTypeId: 'custom-iocs',
      name,
      requiredField: { label: 'Indicator Value', value: uniq('deadbeefcafe') },
    })

    await expect(configRow(page, name).getByText('Draft')).toBeVisible()
    const list = await listConfigs(request, 'custom-iocs')
    expect(list.some((c) => c.name === name)).toBeTruthy()

    await deleteDraft(page, name)
    const after = await listConfigs(request, 'custom-iocs')
    expect(after.some((c) => c.name === name)).toBeFalsy()
  })
})

import { test, expect } from '@playwright/test'
import { APP_ID } from './helpers'

/**
 * App Shell + navigation E2E for an installed marketplace app (crowdstrike-edr,
 * display name "CrowdStrike Falcon", navLayout: sidebar) plus the platform
 * sidebar's "Environments" entry.
 *
 * Selectors are taken from the real components:
 *  - client/src/pages/apps/AppShell.tsx
 *      · persistent header:  <header data-testid="app-header-bar"> with the
 *        collapse <button> (aria-label "Collapse navigation" / "Expand
 *        navigation", aria-expanded) + logo + app-name <span>.
 *      · app nav (sidebar layout):  <nav aria-label="CrowdStrike Falcon
 *        navigation"> with "Pages" (Overview, Setup Guide) and "Configurations"
 *        (Host Group / Prevention Policy / Custom IOC Configuration) link groups.
 *      · collapse state persisted in localStorage key veltrix:appSidebarCollapsed.
 *  - client/src/pages/apps/AppConfigTypePage.tsx — list view <h1>{configType.name}</h1>.
 *  - apps/crowdstrike-edr/client/pages/{OverviewPage,SetupGuidePage}.tsx — bundle pages.
 *  - client/src/components/ui/Sidebar.tsx — main platform sidebar, "Environments"
 *    item (to="/environments") under the Pipeline area.
 *  - client/src/pages/environments/EnvironmentsPage.tsx — <h1>Environments</h1>.
 */

const APP_NAME = 'CrowdStrike Falcon'
const APP_NAV_LABEL = `${APP_NAME} navigation`
const COLLAPSE_KEY = 'veltrix:appSidebarCollapsed'
const APP_HOME = `/apps/${APP_ID}`

// The three configuration-type nav items the app declares.
const CONFIG_TYPE_ITEMS = [
  'Host Group Configuration',
  'Prevention Policy Configuration',
  'Custom IOC Configuration',
]

test.describe('Installed app: branded App Shell + navigation', () => {
  test('branded shell renders a persistent header with the app name and a nav listing the config types', async ({
    page,
  }) => {
    await page.goto(APP_HOME)

    // Persistent branded header (present in BOTH tab and sidebar layouts).
    const header = page.getByTestId('app-header-bar')
    await expect(header).toBeVisible()
    await expect(header.getByText(APP_NAME, { exact: true })).toBeVisible()

    // The embedded app nav (sidebar layout) lists each config-type item.
    const appNav = page.getByRole('navigation', { name: APP_NAV_LABEL })
    await expect(appNav).toBeVisible()
    for (const label of CONFIG_TYPE_ITEMS) {
      await expect(appNav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    // ...and the app's bundle-page nav items.
    await expect(appNav.getByRole('link', { name: 'Overview', exact: true })).toBeVisible()
    await expect(appNav.getByRole('link', { name: 'Setup Guide', exact: true })).toBeVisible()
  })

  test('navigating to a configuration type opens its authoring page; header stays branded', async ({
    page,
  }) => {
    await page.goto(APP_HOME)

    const appNav = page.getByRole('navigation', { name: APP_NAV_LABEL })
    await appNav.getByRole('link', { name: 'Host Group Configuration', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/config/host-groups$`))
    await expect(
      page.getByRole('heading', { name: 'Host Group Configuration', level: 1 }),
    ).toBeVisible()

    // App identity persists across views (still in the header).
    await expect(page.getByTestId('app-header-bar').getByText(APP_NAME, { exact: true })).toBeVisible()
  })

  test('bundle pages (Overview, Setup Guide) render app content without crashing', async ({
    page,
  }) => {
    await page.goto(APP_HOME)
    const appNav = page.getByRole('navigation', { name: APP_NAV_LABEL })

    // Overview — content comes from GET /api/apps/crowdstrike-edr/meta.
    await appNav.getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/overview$`))
    await expect(page.getByRole('heading', { name: 'Configuration Types' })).toBeVisible()
    // No error boundary / load-failure fallback.
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
    await expect(page.getByText('Failed to load app details')).toHaveCount(0)

    // Setup Guide — static page with a distinctive heading + step tabs.
    await appNav.getByRole('link', { name: 'Setup Guide', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/setup$`))
    await expect(page.getByRole('heading', { name: /Setup Guide/ })).toBeVisible()
    await expect(page.getByText('This app page crashed')).toHaveCount(0)
    // The header remains branded on the bundle page too.
    await expect(page.getByTestId('app-header-bar').getByText(APP_NAME, { exact: true })).toBeVisible()
  })

  test('sidebar collapse toggle hides the nav and persists across reload', async ({ page }) => {
    await page.goto(APP_HOME)

    const header = page.getByTestId('app-header-bar')
    const toggle = header.getByRole('button') // the sole button in the header bar
    const appNav = page.getByRole('navigation', { name: APP_NAV_LABEL })

    // Starts expanded: nav visible, toggle offers "Collapse navigation".
    await expect(appNav).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAttribute('aria-label', 'Collapse navigation')

    // Collapse — the rail unmounts; the toggle flips.
    await toggle.click()
    await expect(appNav).toHaveCount(0)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-label', 'Expand navigation')
    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBe('1')

    // Persists across a full page reload.
    await page.reload()
    const toggleAfter = page.getByTestId('app-header-bar').getByRole('button')
    await expect(toggleAfter).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('navigation', { name: APP_NAV_LABEL })).toHaveCount(0)
    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBe('1')

    // Expand again — nav returns, preference cleared.
    await toggleAfter.click()
    await expect(page.getByRole('navigation', { name: APP_NAV_LABEL })).toBeVisible()
    await expect(toggleAfter).toHaveAttribute('aria-expanded', 'true')
    expect(await page.evaluate((k) => localStorage.getItem(k), COLLAPSE_KEY)).toBe('0')
  })
})

test.describe('Platform sidebar: Environments', () => {
  test('the main sidebar "Environments" item routes to /environments', async ({ page }) => {
    await page.goto('/')

    const mainNav = page.getByRole('navigation', { name: 'Primary' })
    await expect(mainNav).toBeVisible()

    await mainNav.getByRole('link', { name: 'Environments', exact: true }).click()

    await expect(page).toHaveURL(/\/environments$/)
    await expect(page.getByRole('heading', { name: 'Environments', level: 1 })).toBeVisible()
  })
})

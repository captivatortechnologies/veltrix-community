import { test, expect } from '@playwright/test'
import { uniq, API_URL, readToken, apiPost, apiGetWithToken, APP_ID } from './helpers'
import { createDraftConfig, configRow, gotoConfigType, listConfigs } from './configHelpers'

// The generic Configuration Canvas authoring surface, exercised through the
// crowdstrike-edr "Host Group Configuration" type. The CRUD test below is
// generic platform behaviour — no app-specific code paths.
const CONFIG_TYPE = 'host-groups'

// The second test drives the app's own "Connections" Settings page (its bundle
// lives in the crowdstrike-edr app repo, apps/crowdstrike-edr/client/pages/
// ConnectionsPage.tsx) — app-specific *wiring*, but built entirely from generic
// platform primitives (Credential + Environment picker + the shared FormDialog),
// exactly like the in-context dialog this test used to drive before Connections
// moved out of the config canvas and into app Settings (see git history).
const APP_NAME = 'CrowdStrike Falcon'

test.describe('Configuration Canvas CRUD (host-groups)', () => {
  test('create → read → edit → duplicate → delete', async ({ page, request }) => {
    const name = uniq('e2e-cfg')

    // CREATE (through the real canvas editor).
    await createDraftConfig(page, { configTypeId: CONFIG_TYPE, name })

    // READ — the draft shows in the list (UI) and in the API.
    await expect(configRow(page, name).getByText('Draft')).toBeVisible()
    const afterCreate = await listConfigs(request, CONFIG_TYPE)
    expect(afterCreate.some((c) => c.name === name)).toBeTruthy()

    // UPDATE — rename via the editor to a fully distinct name.
    const renamed = uniq('e2e-cfg2')
    await configRow(page, name).getByTitle('Edit').click()
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeVisible({ timeout: 30_000 })
    await page.getByTitle('Click to rename').click()
    const nameInput = page.getByPlaceholder('Enter configuration name')
    await nameInput.fill(renamed)
    await nameInput.press('Enter')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.getByRole('button', { name: 'New configuration' }).first()).toBeVisible()
    await expect(configRow(page, renamed)).toBeVisible()
    await expect(configRow(page, name)).toHaveCount(0)

    const afterEdit = await listConfigs(request, CONFIG_TYPE)
    expect(afterEdit.some((c) => c.name === renamed)).toBeTruthy()
    expect(afterEdit.some((c) => c.name === name)).toBeFalsy()

    // DUPLICATE — a "<name> (Copy)" draft appears.
    const copyName = `${renamed} (Copy)`
    await configRow(page, renamed).getByTitle('Duplicate').click()
    await expect(configRow(page, copyName)).toBeVisible({ timeout: 15_000 })

    // DELETE — remove the copy first (unambiguous), then the original draft.
    for (const target of [copyName, renamed]) {
      await configRow(page, target).getByTitle('Delete').click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Delete' }).click()
      await expect(configRow(page, target)).toHaveCount(0, { timeout: 15_000 })
    }

    const afterDelete = await listConfigs(request, CONFIG_TYPE)
    expect(afterDelete.some((c) => c.name === renamed || c.name === copyName)).toBeFalsy()
  })

  test('Settings → Connections: register a Falcon API connection', async ({ page, request }) => {
    const token = readToken()

    // The Connection dialog's Environment picker requires an existing environment
    // to attach to. Set one up via the API — the Environments page's own UI flow
    // isn't what this test is exercising (and API-driven setup keeps the test
    // focused on the Connections dialog, per house rules).
    const envName = uniq('e2e-env')
    const env = await apiPost<{ id: string; name: string }>(request, '/environments', token, {
      name: envName,
    })

    // Unique name/host/client-id so cleanup can target exactly what we create and
    // re-runs never collide. Declared outside the try so the `finally` below can
    // still look this credential up by name even if an assertion throws before
    // `created` is resolved from the API read-back.
    const credName = uniq('e2e-conn')
    const clientId = uniq('clientid')
    const endpoint = `https://${uniq('e2e')}.crowdstrike.com`
    let createdCredentialId: string | undefined

    // The whole UI + assertion flow runs inside try/finally so a *failing*
    // assertion (e.g. the row not showing up) can never skip cleanup — that's
    // exactly how this spec previously leaked an `e2e-conn-*` credential (and
    // its `e2e-env-*` environment) into the shared dev tenant on every red run:
    // an early `throw` from `expect()` jumped straight past the cleanup calls
    // that used to sit at the bottom of the test body.
    try {
      // Navigate via the real nav (Settings group of the app's sidebar) so this
      // also proves the Settings/Connections tab is actually discoverable.
      await page.goto(`/apps/${APP_ID}`)
      const appNav = page.getByRole('navigation', { name: `${APP_NAME} navigation` })
      await appNav.getByRole('link', { name: 'Connections', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/apps/${APP_ID}/connections$`))
      await expect(page.getByRole('heading', { name: 'Connections', level: 2 })).toBeVisible({
        timeout: 30_000,
      })

      await page.getByRole('button', { name: 'Add connection' }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await dialog.getByLabel('Name').fill(credName)
      // Scoped to the dialog — the list's own Environment *filter* combobox (in the
      // FilterBar behind the dialog) shares the same accessible name.
      await dialog.getByRole('combobox', { name: 'Environment' }).click()
      await dialog.getByRole('option', { name: envName, exact: true }).click()
      await dialog.getByLabel('Endpoint (optional)').fill(endpoint)
      // Auth method defaults to "API client (id + secret)" — the Falcon-native flow
      // this test exercises — so "Client ID"/"Client secret" are already the active labels.
      await dialog.getByLabel('Client ID').fill(clientId)
      await dialog.getByLabel('Client secret').fill(uniq('secret'))

      await dialog.getByRole('button', { name: 'Add connection', exact: true }).click()

      // On success the dialog closes immediately (the row list itself refreshes a
      // moment later). If creation instead failed, the dialog stays open with an
      // error banner — surface that explicitly rather than a bare timeout.
      await expect(dialog).toHaveCount(0, { timeout: 15_000 })

      // READ — the new connection's row shows the fields we entered. The list can
      // already hold more than a page's worth of connections (this is a shared
      // dev tenant), so search for it rather than assuming it lands on page 1.
      await page.getByPlaceholder('Search connections…').fill(credName)
      const row = page.locator('tr', { hasText: credName })
      await expect(row).toBeVisible()
      await expect(row.getByText(envName, { exact: true })).toBeVisible()
      await expect(row.getByText(clientId, { exact: true })).toBeVisible()
      await expect(row.getByText(/api client/i)).toBeVisible()
      await expect(row.getByText(endpoint, { exact: true })).toBeVisible()

      // API read-back: the credential is really persisted against the app's Tool
      // (upserted on install, matched by name — see ConnectionsPage's resolveTool),
      // with the fields we entered (secrets excluded from the redacted response).
      const tools = await apiGetWithToken<{ data: Array<{ id: string; name: string }> }>(
        request,
        `/tools?search=${encodeURIComponent(APP_NAME)}`,
        token,
      )
      const tool = tools.data.find((t) => t.name === APP_NAME)
      expect(tool, `platform Tool "${APP_NAME}" should exist (upserted on app install)`).toBeTruthy()

      const credentials = await apiGetWithToken<
        Array<{ id: string; name: string; username: string; endpoint: string | null; type: string | null }>
      >(request, `/tools/${tool!.id}/credentials`, token)
      const created = credentials.find((c) => c.name === credName)
      expect(created, `API should list the "${credName}" connection`).toBeTruthy()
      expect(created?.username).toBe(clientId)
      expect(created?.endpoint).toBe(endpoint)
      expect(created?.type).toBe('TOKEN')

      createdCredentialId = created?.id
    } finally {
      // Cleanup — delete the credential + environment we created so re-runs don't
      // accumulate against the tenant's quotas. Runs unconditionally (even after
      // an assertion above threw) and is itself best-effort: a cleanup failure
      // must never mask the real test failure it's running alongside.
      if (!createdCredentialId) {
        // The failure happened before/without resolving `created` from the API
        // read-back above — look the credential up by its unique name directly
        // so cleanup still finds it.
        const bearerHeader = { Authorization: `Bearer ${token}` }
        createdCredentialId = await request
          .get(`${API_URL}/tools?search=${encodeURIComponent(APP_NAME)}`, { headers: bearerHeader })
          .then((res) => res.json())
          .then(async (tools: { data: Array<{ id: string; name: string }> }) => {
            const tool = tools.data.find((t) => t.name === APP_NAME)
            if (!tool) return undefined
            const credentials = await request
              .get(`${API_URL}/tools/${tool.id}/credentials`, { headers: bearerHeader })
              .then((res) => res.json())
            return (credentials as Array<{ id: string; name: string }>).find((c) => c.name === credName)?.id
          })
          .catch(() => undefined)
      }
      if (createdCredentialId) {
        await request
          .delete(`${API_URL}/credentials/${createdCredentialId}`, { headers: { Authorization: `Bearer ${token}` } })
          .catch(() => undefined)
      }
      await request
        .delete(`${API_URL}/environments/${env.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => undefined)
    }
  })
})

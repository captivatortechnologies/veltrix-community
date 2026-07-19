import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { API_URL, APP_ID, authHeaders } from './helpers'

/** Display headings for the crowdstrike-edr config types. */
export const CONFIG_TYPE_NAMES: Record<string, string> = {
  'host-groups': 'Host Group Configuration',
  'prevention-policies': 'Prevention Policy Configuration',
  'custom-iocs': 'Custom IOC Configuration',
}

/**
 * Locates the control (input/select/textarea) for a Configuration Canvas field by
 * its visible label. Canvas fields render the `<label>` and the control in sibling
 * divs with no htmlFor/id association, so we anchor on the label text and walk up
 * to the nearest ancestor that actually contains a control.
 */
export function canvasField(page: Page, label: string): Locator {
  return page
    .locator('label', { hasText: label })
    .locator('xpath=ancestor::div[.//input or .//select or .//textarea][1]')
    .locator('input, select, textarea')
    .first()
}

/** Navigate to an app config-type list page and wait for it to render. */
export async function gotoConfigType(page: Page, configTypeId: string): Promise<void> {
  await page.goto(`/apps/${APP_ID}/config/${configTypeId}`)
  await expect(
    page.getByRole('heading', { name: CONFIG_TYPE_NAMES[configTypeId], level: 1 }),
  ).toBeVisible({ timeout: 30_000 })
}

/** The table row for a configuration, located by its (unique) name. */
export function configRow(page: Page, name: string): Locator {
  return page.locator('tr', { hasText: name })
}

/**
 * Creates a DRAFT configuration through the real canvas editor:
 * "New configuration" → rename → fill the required field → Save → back to list.
 * Returns once the new row is visible in the list. Reused by both the config-canvas
 * and reviews specs.
 */
export async function createDraftConfig(
  page: Page,
  opts: { configTypeId: string; name: string; requiredField?: { label: string; value: string } },
): Promise<void> {
  const requiredField = opts.requiredField ?? { label: 'Group Name', value: opts.name }

  await gotoConfigType(page, opts.configTypeId)
  await page.getByRole('button', { name: 'New configuration' }).first().click()

  // Editor toolbar Save button (icon + "Save"); disabled while the canvas has errors.
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeVisible({ timeout: 30_000 })

  // Rename the configuration.
  await page.getByTitle('Click to rename').click()
  const nameInput = page.getByPlaceholder('Enter configuration name')
  await nameInput.fill(opts.name)
  await nameInput.press('Enter')

  // Fill the required canvas field so validation passes and Save enables.
  await canvasField(page, requiredField.label).fill(requiredField.value)

  await expect(save).toBeEnabled({ timeout: 10_000 })
  await save.click()

  // Back on the list, the new draft row is present.
  await expect(page.getByRole('button', { name: 'New configuration' }).first()).toBeVisible({
    timeout: 20_000,
  })
  await expect(configRow(page, opts.name)).toBeVisible({ timeout: 15_000 })
}

/** GET the configuration list for an app config type (returns the `data` array). */
export async function listConfigs(
  request: APIRequestContext,
  configTypeId: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
  const res = await request.get(
    `${API_URL}/configuration-canvas?toolType=${APP_ID}&entityType=${configTypeId}`,
    { headers: authHeaders() },
  )
  expect(res.ok(), `list configs → ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { data?: Array<{ id: string; name: string; status: string }> }
  return body.data ?? []
}

import { test, expect, type Page } from '@playwright/test'
import { apiGet, uniq } from './helpers'

/**
 * FULL CRUD for the Environments feature, driven through the real UI on :5173
 * and cross-checked against the API on :5000. Part of the "all CRUD works
 * everywhere" suite.
 *
 * One environment is threaded through create → read → rename → controls → delete
 * inside a single test (steps) so state never has to be shared across tests.
 * Every mutation asserts BOTH a UI outcome and an API read-back.
 *
 * Run/iterate with:
 *   npx playwright test tests/environments.spec.ts --project=verify
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KNOWN PRODUCT BUG (this spec fails at CREATE — by design, do NOT weaken it):
 *
 * Environment WRITE operations (POST/PUT/DELETE /api/environments) fail in the
 * real UI with a "Failed to fetch" error. READ (GET) works.
 *
 * Root cause: `/api/environments` is missing from the server CSRF `excludePaths`
 * (server/src/server.ts) even though it uses Bearer/JWT auth exactly like its
 * siblings that ARE excluded (/api/tags, /api/tools, /api/credentials,
 * /api/pipeline, /api/apps, /api/sandboxes, …). Additionally the client
 * `environmentsApi` omits `credentials: 'include'` (which sibling APIs use), so
 * no XSRF-TOKEN cookie is ever established. Result: every mutation hits the CSRF
 * double-submit check with no cookie → HTTP 403 "CSRF token missing from cookie".
 * Because the CSRF onRequest hook replies before @fastify/cors attaches the
 * Access-Control-Allow-Origin header, the 403 has no CORS header, so the browser
 * blocks it and fetch rejects with "Failed to fetch".
 *
 * Verified directly: GET /api/environments → 200; POST /api/environments (Bearer,
 * no CSRF) → 403 {"error":"CSRF token missing from cookie"} with no ACAO header.
 *
 * The assertions below encode the CORRECT expected behavior (create/edit/delete
 * succeed via the UI + agree with the API). They will pass once the route is
 * added to the CSRF exclude list (and/or the client sends credentials + CSRF).
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface EnvApi {
  id: string
  name: string
  owner: unknown
  policy: { requireApproval: boolean; minApprovers: number } | null
  deploymentCount: number
}

/** Best-effort dismissal of any open toast so it can't cover a later click. */
async function dismissToasts(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' })
  const n = await dismiss.count()
  for (let i = 0; i < n; i++) {
    await dismiss.nth(i).click({ force: true, timeout: 2_000 }).catch(() => {})
  }
  await expect(dismiss).toHaveCount(0)
}

/** The table row that owns a given environment (identified by its unique Delete action). */
function rowFor(page: Page, name: string) {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Delete ${name}`, exact: true }) })
}

test('Environments: full CRUD through the UI + API read-back', async ({ page, request }) => {
  const name = uniq('e2e-env')
  const renamed = uniq('e2e-env-upd')

  await page.goto('/environments', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Environments', level: 1 })).toBeVisible()

  // ---------------------------------------------------------------- CREATE
  await test.step('CREATE via the New environment dialog', async () => {
    await page.getByRole('button', { name: 'New environment' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'New environment' })).toBeVisible()
    await dialog.getByLabel('Name').fill(name)
    // Owner is a custom Select — leave the default ("No owner").
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()

    // Wait for the mutation to resolve one way or the other (success toast, or the
    // dialog's error banner), then insist it was a success. On the current build
    // this is where the KNOWN CSRF/CORS bug (see file header) surfaces: the dialog
    // shows a "Failed to fetch" alert instead of closing.
    await expect(
      page.getByText(`Environment "${name}" created`).or(dialog.getByRole('alert')),
    ).toBeVisible()
    await expect(
      dialog.getByRole('alert'),
      'CREATE failed in the UI. Known bug: /api/environments is missing from the server ' +
        'CSRF excludePaths and environmentsApi omits credentials:include, so the POST 403s ' +
        '("CSRF token missing from cookie") with no CORS header → "Failed to fetch".',
    ).toHaveCount(0)

    // UI: success toast + the row shows up in the table.
    await expect(page.getByText(`Environment "${name}" created`)).toBeVisible()
    await expect(page.getByText(name, { exact: true })).toBeVisible()

    // API read-back: the environment now exists on the server.
    const list = await apiGet<EnvApi[]>(request, '/environments')
    expect(list.some((e) => e.name === name), `API should list "${name}"`).toBeTruthy()

    await dismissToasts(page)
  })

  // ------------------------------------------------------------------ READ
  await test.step('READ the created row (name, owner cell, controls badge)', async () => {
    const row = rowFor(page, name)
    await expect(row).toBeVisible()
    await expect(row.getByText(name, { exact: true })).toBeVisible()
    // 4 data columns (Environment, Owner, Controls, Deployments) + 1 actions cell.
    await expect(row.getByRole('cell')).toHaveCount(5)
    // The Controls cell renders a policy badge — either state is valid at this point.
    await expect(row.getByText(/Auto-deploy|Approval required/)).toBeVisible()
  })

  // ---------------------------------------------------------- UPDATE (rename)
  await test.step('UPDATE: rename via the Edit dialog', async () => {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit environment' })).toBeVisible()
    await dialog.getByLabel('Name').fill(renamed)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    // UI: the new name is present, the old name is gone from the table.
    await expect(page.getByText(renamed, { exact: true })).toBeVisible()
    await expect(page.getByText(name, { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: `Delete ${name}`, exact: true }),
    ).toHaveCount(0)

    // API read-back: renamed present, original name absent.
    const list = await apiGet<EnvApi[]>(request, '/environments')
    expect(list.some((e) => e.name === renamed), `API should list "${renamed}"`).toBeTruthy()
    expect(list.some((e) => e.name === name), `API should no longer list "${name}"`).toBeFalsy()

    await dismissToasts(page)
  })

  // ------------------------------------------------- UPDATE (controls / policy)
  await test.step('UPDATE controls: require approval, min approvers = 2', async () => {
    await page.getByRole('button', { name: `Controls for ${renamed}`, exact: true }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(`Controls · ${renamed}`)).toBeVisible()

    const requireApproval = dialog.getByLabel('Require approval before deploying')
    if (!(await requireApproval.isChecked())) await requireApproval.check()
    await expect(requireApproval).toBeChecked()

    // "Minimum approvers" only renders once approval is required.
    await dialog.getByLabel('Minimum approvers').fill('2')
    await dialog.getByRole('button', { name: 'Save controls', exact: true }).click()

    // UI: success toast + the row's Controls badge reflects the new policy.
    await expect(page.getByText('Controls saved')).toBeVisible()
    await expect(rowFor(page, renamed).getByText(/Approval required.*2 approvers/)).toBeVisible()

    // API read-back: the persisted policy matches.
    const list = await apiGet<EnvApi[]>(request, '/environments')
    const item = list.find((e) => e.name === renamed)
    expect(item, `API should still list "${renamed}"`).toBeTruthy()
    expect(item?.policy?.requireApproval).toBe(true)
    expect(item?.policy?.minApprovers).toBe(2)

    await dismissToasts(page)
  })

  // ---------------------------------------------------------------- DELETE
  await test.step('DELETE via the confirmation dialog', async () => {
    await page.getByRole('button', { name: `Delete ${renamed}`, exact: true }).click()

    const alert = page.getByRole('alertdialog')
    await expect(alert.getByRole('heading', { name: `Delete "${renamed}"?` })).toBeVisible()
    await alert.getByRole('button', { name: 'Delete', exact: true }).click()

    // UI: success toast + the row disappears.
    await expect(page.getByText(`Environment "${renamed}" deleted`)).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Delete ${renamed}`, exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText(renamed, { exact: true })).toHaveCount(0)

    // API read-back: the environment is gone.
    const list = await apiGet<EnvApi[]>(request, '/environments')
    expect(list.some((e) => e.name === renamed), `API should no longer list "${renamed}"`).toBeFalsy()
  })
})

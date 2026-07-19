import { test, expect } from '@playwright/test'
import { uniq, CREDS } from './helpers'
import { createDraftConfig, configRow } from './configHelpers'

// The GitHub-PR-style review pipeline on the generic config surface:
//   1. threaded comments (create / read / reply / resolve-reopen / delete)
//   2. the approval → request-changes workflow (status transition)
const CONFIG_TYPE = 'host-groups'

/** Open the Reviews drawer for a config row and return the drawer locator. */
async function openReviews(page: import('@playwright/test').Page, name: string) {
  await configRow(page, name).getByTitle('Reviews & comments').click()
  const drawer = page.getByRole('dialog', { name: `Reviews for ${name}` })
  await expect(drawer).toBeVisible()
  return drawer
}

test.describe('Review pipeline', () => {
  test('comment CRUD: create → read → resolve/reopen → reply → delete', async ({ page }) => {
    const name = uniq('e2e-rev')
    await createDraftConfig(page, { configTypeId: CONFIG_TYPE, name })

    const drawer = await openReviews(page, name)

    // CREATE
    const body = `E2E comment ${uniq('c')}`
    await drawer.getByLabel('Add a comment').fill(body)
    await drawer.getByRole('button', { name: 'Comment', exact: true }).click()

    // READ
    const comment = drawer.locator('[data-testid="review-comment"]', { hasText: body })
    await expect(comment).toBeVisible({ timeout: 15_000 })

    // UPDATE (resolve → reopen) — author may moderate. The toggle button label
    // flips Resolve→Reopen→Resolve; assert on that (unambiguous) plus the badge.
    await comment.getByRole('button', { name: 'Resolve' }).first().click()
    await expect(comment.getByRole('button', { name: 'Reopen' })).toBeVisible()
    await expect(comment.getByText('Resolved', { exact: true })).toBeVisible()
    await comment.getByRole('button', { name: 'Reopen' }).first().click()
    await expect(comment.getByRole('button', { name: 'Resolve' })).toBeVisible()
    await expect(comment.getByText('Resolved', { exact: true })).toHaveCount(0)

    // REPLY (threaded create)
    const replyBody = `E2E reply ${uniq('r')}`
    await comment.getByRole('button', { name: 'Reply' }).first().click()
    await drawer.getByLabel('Reply').fill(replyBody)
    await comment.getByRole('button', { name: 'Reply' }).last().click()
    await expect(drawer.getByText(replyBody)).toBeVisible({ timeout: 15_000 })

    // DELETE (parent comment)
    await comment.getByRole('button', { name: 'Delete' }).first().click()
    await expect(drawer.getByText(body)).toHaveCount(0, { timeout: 15_000 })

    // Cleanup — the config is still a DRAFT, so remove it.
    await drawer.getByRole('button', { name: 'Close reviews' }).click()
    await configRow(page, name).getByTitle('Delete').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(configRow(page, name)).toHaveCount(0, { timeout: 15_000 })
  })

  test('approval → request changes moves the config to CHANGES_REQUESTED', async ({ page }) => {
    const name = uniq('e2e-appr')
    await createDraftConfig(page, { configTypeId: CONFIG_TYPE, name })

    // Submit for approval — assign an existing environment tag + the dev user as approver.
    // The approval modal is a plain overlay (no role=dialog) anchored by its <h3> heading.
    await configRow(page, name).getByTitle('Submit for approval').click()
    const approvalModal = page.locator('div.fixed.inset-0', {
      has: page.getByRole('heading', { name: 'Submit for Approval' }),
    })
    await expect(approvalModal).toBeVisible()

    // Environment (required): pick the seeded "dev" tag.
    await approvalModal.getByRole('button', { name: 'dev', exact: true }).click()

    // Approver (required): search + select the signed-in dev user (self-review).
    await approvalModal.getByPlaceholder('Search users...').fill(CREDS.email)
    await approvalModal.locator('label', { hasText: CREDS.email }).first().click()

    // The dialog's submit button reads "Submit for Approval" (capital A) — exact+case-sensitive
    // avoids the row buttons whose title is "Submit for approval".
    await approvalModal.getByRole('button', { name: 'Submit for Approval', exact: true }).click()

    // The row now reflects pending approval.
    await expect(configRow(page, name).getByText('Pending approval')).toBeVisible({ timeout: 15_000 })

    // Open reviews: dev is the assigned reviewer → Approve / Request changes are available.
    const drawer = await openReviews(page, name)
    await expect(drawer.getByText(/Approved 0\/1/)).toBeVisible()

    await drawer.getByRole('button', { name: 'Request changes' }).click()
    const reasonDialog = page.getByRole('dialog', { name: 'Request changes' })
    await expect(reasonDialog).toBeVisible()
    await reasonDialog.getByLabel('Rejection reason').fill('Please tighten the assignment rule.')
    await reasonDialog.getByRole('button', { name: 'Request changes' }).click()

    // Status transitions to CHANGES_REQUESTED — visible in the drawer header and the list row.
    await expect(drawer.getByText(/changes requested/i)).toBeVisible({ timeout: 15_000 })
    await drawer.getByRole('button', { name: 'Close reviews' }).click()
    await expect(configRow(page, name).getByText('Changes requested')).toBeVisible({ timeout: 15_000 })
  })
})

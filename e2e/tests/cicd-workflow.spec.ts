import { test, expect, type Page } from '@playwright/test'
import { uniq, CREDS, API_URL, authHeaders } from './helpers'
import { createDraftConfig, configRow, listConfigs } from './configHelpers'

/**
 * The full GitHub-PR-style "CICD" review workflow on a configuration canvas:
 *
 *   author draft → review surface (commits + discussion) → comment
 *   → submit for approval → reviewer requests changes (CHANGES_REQUESTED)
 *   → author re-requests review → reviewer approves → APPROVED
 *
 * A dedicated environment is created for the run so the governing policy is a
 * fresh single-approver one (minApprovers:1, no required roles) — dev's single
 * self-review then deterministically flips the config to APPROVED.
 */
const CONFIG_TYPE = 'host-groups'

async function openReviews(page: Page, name: string) {
  await configRow(page, name).getByTitle('Reviews & comments').click()
  const drawer = page.getByRole('dialog', { name: `Reviews for ${name}` })
  await expect(drawer).toBeVisible()
  return drawer
}

/** Fill + submit the shared approval dialog (plain overlay anchored by its <h3>). */
async function completeApprovalDialog(page: Page, envName: string) {
  // Scope to z-50: the approval overlay. During re-request it is nested inside
  // the still-open Reviews drawer (z-40, also fixed inset-0), so z-50 disambiguates.
  const modal = page.locator('div.fixed.inset-0.z-50', {
    has: page.getByRole('heading', { name: 'Submit for Approval' }),
  })
  await expect(modal).toBeVisible()

  // Environment (required). On re-request it may already be selected — only click
  // if it isn't (selected chips carry bg-blue-600).
  const envBtn = modal.getByRole('button', { name: envName, exact: true })
  await expect(envBtn).toBeVisible()
  if (!((await envBtn.getAttribute('class')) || '').includes('bg-blue-600')) await envBtn.click()

  // Approver (required, starts empty each open): the signed-in dev user.
  await modal.getByPlaceholder('Search users...').fill(CREDS.email)
  await modal.locator('label', { hasText: CREDS.email }).first().click()

  await modal.getByRole('button', { name: 'Submit for Approval', exact: true }).click()
  await expect(modal).toHaveCount(0)
}

test.describe('CICD review workflow', () => {
  test('author → submit → comment → request changes → re-request → approve → APPROVED', async ({
    page,
    request,
  }) => {
    // Dedicated environment (fresh default policy: 1 approver, no required roles).
    const envName = uniq('e2e-cicd-env')
    const envRes = await request.post(`${API_URL}/environments`, {
      headers: authHeaders(),
      data: { name: envName },
    })
    expect(envRes.ok(), `create env → ${envRes.status()}`).toBeTruthy()
    const envId = (await envRes.json()).id
    let configId: string | undefined

    try {
      const name = uniq('e2e-cicd')

      // 1. Author the change as a DRAFT config.
      await createDraftConfig(page, { configTypeId: CONFIG_TYPE, name })
      await expect(configRow(page, name).getByText('Draft')).toBeVisible()

      // 2. Review surface: reviewers + version commits + discussion, and a comment.
      let drawer = await openReviews(page, name)
      for (const section of ['Reviewers', 'Commits & Changes', 'Discussion']) {
        await expect(drawer.getByText(section, { exact: true })).toBeVisible()
      }
      const note = `Ship note ${uniq('n')}`
      await drawer.getByLabel('Add a comment').fill(note)
      await drawer.getByRole('button', { name: 'Comment', exact: true }).click()
      await expect(drawer.locator('[data-testid="review-comment"]', { hasText: note })).toBeVisible()
      await drawer.getByRole('button', { name: 'Close reviews' }).click()

      // 3. Open the review: submit for approval → PENDING_APPROVAL.
      await configRow(page, name).getByTitle('Submit for approval').click()
      await completeApprovalDialog(page, envName)
      await expect(configRow(page, name).getByText('Pending approval')).toBeVisible({ timeout: 15_000 })

      // 4. Reviewer requests changes → CHANGES_REQUESTED.
      drawer = await openReviews(page, name)
      await expect(drawer.getByText(/Approved 0\/1/)).toBeVisible()
      await drawer.getByRole('button', { name: 'Request changes' }).click()
      const reason = page.getByRole('dialog', { name: 'Request changes' })
      await reason.getByLabel('Rejection reason').fill('Please scope the assignment rule more tightly.')
      await reason.getByRole('button', { name: 'Request changes' }).click()
      await expect(drawer.getByText(/changes requested/i)).toBeVisible({ timeout: 15_000 })

      // 5. Author re-requests review → back to PENDING_APPROVAL.
      await drawer.getByRole('button', { name: 'Re-request review' }).click()
      await completeApprovalDialog(page, envName)
      await expect(drawer.getByText(/pending approval/i)).toBeVisible({ timeout: 15_000 })

      // 6. Reviewer approves → APPROVED (1/1 meets the env's single-approver policy).
      const approve = drawer.getByRole('button', { name: 'Approve', exact: true })
      await expect(approve).toBeVisible({ timeout: 15_000 })
      await approve.click()
      await expect(drawer.getByText(/Approved 1\/1/)).toBeVisible({ timeout: 15_000 })
      await drawer.getByRole('button', { name: 'Close reviews' }).click()
      await expect(configRow(page, name).getByText('Approved', { exact: true })).toBeVisible({ timeout: 15_000 })

      // 7. API read-back: the terminal review status is APPROVED.
      const list = await listConfigs(request, CONFIG_TYPE)
      const item = list.find((c) => c.name === name)
      expect(item?.status).toBe('APPROVED')
      configId = item?.id
    } finally {
      // Best-effort cleanup (config first so its approval-env link releases the tag).
      if (configId) await request.delete(`${API_URL}/configuration-canvas/${configId}`, { headers: authHeaders() })
      await request.delete(`${API_URL}/environments/${envId}`, { headers: authHeaders() })
    }
  })
})

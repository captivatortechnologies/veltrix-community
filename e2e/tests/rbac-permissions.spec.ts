import { test, expect } from '@playwright/test'
import {
  TEST_PASSWORD,
  adminToken,
  apiLogin,
  apiGetWithToken,
  apiPost,
  csrfPost,
  csrfPutExpectingFailure,
  loginViaUI,
  provisionTenant,
  uniq,
} from './helpers'
import { createDraftConfig, gotoConfigType } from './configHelpers'

/**
 * RBAC granularity (Wave R/C, `_ai_tasks/rbac-idp-hardening/2026-07-10/01_plan.md`) — proves
 * the fail-closed permission model end-to-end: a NARROW, run-created role (one platform
 * resource + ONE app-scoped resource on the shared crowdstrike-edr app, via the appId-aware
 * role API) gates the sidebar, an app's config-type pages, and `GET /api/me/permissions`
 * identically; a self-escalation attempt on that same role is blocked server-side; the
 * tenant's own Administrator (all:all) and the platform admin are unaffected (regression).
 *
 * crowdstrike-edr is the shared, pre-existing app catalog entry (see e2e/tests/crowdstrike.spec.ts) —
 * this spec never modifies it, it only ENABLES it for a tenant this run creates and grants a
 * narrow slice of its already-declared app-scoped resources (host-groups / prevention-policies).
 * No shipped app manifest currently declares a page-level `requiresPermission` (verified by
 * inspection of every app in the local veltrix-apps checkout), so the literal
 * `AppPageHost` "You don't have permission to view this page" panel has no real trigger data
 * to drive end-to-end without fabricating a manifest change to a real vendor app's catalog
 * entry — which would violate the "never mutate the shared app catalog" rule. That exact
 * component IS covered by Wave C5's AppPageHost unit/component tests. Here the equivalent,
 * ACTUALLY-ENFORCED app-scoped fail-closed boundary is proven instead: the Configuration
 * Canvas template fetch, gated server-side by the identical `hasAppPermission(appId, resource,
 * action)` resolver (`server/src/core/app-engine/app-config-template.route.ts`), reachable via
 * the app's own config-type nav tabs (`AppShell.buildAppNavItems`) — same permission model,
 * same fail-closed design, real installed app, zero shared-catalog mutation.
 */

const CROWDSTRIKE_APP_ID = 'crowdstrike-edr'

test.describe('RBAC permission granularity', () => {
  test('narrow role fail-closes the sidebar and app pages, blocks self-escalation, and leaves admins unaffected', async ({
    request,
    browser,
    page,
  }) => {
    const runId = uniq('e2e-rbac')
    let crowdstrikeAppId = ''
    let narrowRoleId = ''
    let narrowUserEmail = ''
    let narrowUserToken = ''
    let tenant!: Awaited<ReturnType<typeof provisionTenant>>

    await test.step('setup: provision a tenant, enable crowdstrike-edr, and read its live resource catalog', async () => {
      const platformToken = await adminToken()
      tenant = await provisionTenant(request, platformToken, {
        namePrefix: `${runId}-tenant`,
        adminPassword: TEST_PASSWORD,
      })

      const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)

      // Enable the shared crowdstrike-edr app for THIS tenant only — /api/apps is on the
      // server's CSRF exclude list, so the plain bearer-token helper works unmodified.
      await apiPost(request, `/apps/${CROWDSTRIKE_APP_ID}/enable`, tenantAdmin.token, {})

      // Live catalog (R4): platform resources + this tenant's installed apps' declared
      // resources. Pull the app's real App.id (appId-aware role API — role.route.ts's
      // createRoleSchema/updateRoleSchema `permissions[].appId`).
      const catalog = await apiGetWithToken<
        Array<{ resource: string; actions: string[]; appId: string | null; appName?: string }>
      >(request, '/resources', tenantAdmin.token)
      const hostGroups = catalog.find((entry) => entry.resource === 'host-groups' && entry.appId)
      expect(hostGroups, 'crowdstrike-edr should declare a "host-groups" app-scoped resource').toBeTruthy()
      crowdstrikeAppId = hostGroups!.appId!
      expect(catalog.some((e) => e.resource === 'prevention-policies' && e.appId === crowdstrikeAppId)).toBeTruthy()
    })

    await test.step('setup: create a NARROW role (one platform resource + one app-scoped resource)', async () => {
      const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)

      // Narrow, non-admin permission set: enough to view environments and fully operate ONE
      // of crowdstrike-edr's three config types (host-groups) — but explicitly NOT
      // `role:read` (Access Control must hide), NOT `prevention-policies`/`custom-iocs`
      // (those config types must fail-closed), and NOT `all:all`/`apps:write`. `role:write`
      // (platform) is granted so the escalation-blocked assertion below exercises the REAL
      // `assertNoEscalation` guard (role.service.ts) rather than merely the coarse
      // `hasPermission('role','write')` route gate.
      const role = await csrfPost<{ id: string; name: string }>(request, '/roles', tenantAdmin.token, {
        name: `${runId}-narrow-role`,
        description: 'E2E: narrow, non-admin role — one platform resource + one app resource',
        permissions: [
          { resource: 'tag', action: 'read' },
          { resource: 'configuration-canvas', action: 'read' },
          { resource: 'configuration-canvas', action: 'write' },
          { resource: 'component', action: 'read' },
          { resource: 'host-groups', action: 'read', appId: crowdstrikeAppId },
          { resource: 'host-groups', action: 'write', appId: crowdstrikeAppId },
          { resource: 'role', action: 'write' },
        ],
      })
      narrowRoleId = role.id

      narrowUserEmail = `${runId}-user@e2e.test`
      await csrfPost(request, '/users', tenantAdmin.token, {
        name: 'E2E Narrow User',
        email: narrowUserEmail,
        password: TEST_PASSWORD,
        roleId: narrowRoleId,
        customerId: tenant.customerId,
      })

      const narrowLogin = await apiLogin(narrowUserEmail, TEST_PASSWORD)
      narrowUserToken = narrowLogin.token
      expect(narrowLogin.user.role).toBe(`${runId}-narrow-role`)
    })

    const narrowContext = await browser.newContext()
    const narrowPage = await narrowContext.newPage()
    try {
      await test.step('narrow user logs in through the real UI', async () => {
        await loginViaUI(narrowPage, narrowUserEmail, TEST_PASSWORD)
        await expect.poll(() => new URL(narrowPage.url()).pathname).toBe('/')
      })

      await test.step('app resource the role PERMITS (host-groups): renders and fully operates normally', async () => {
        // Also proves the permission snapshot has resolved for real (not just the
        // fail-closed default) before the negative assertions below run.
        await createDraftConfig(narrowPage, { configTypeId: 'host-groups', name: uniq(`${runId}-hostgroup`) })
      })

      await test.step('sidebar shows only what the role permits: Access Control hidden (no role:read)', async () => {
        await narrowPage.goto('/')
        await narrowPage.getByRole('button', { name: 'Settings', exact: true }).click()
        // The submenu did expand (sanity — an always-visible sibling item is present)...
        await expect(narrowPage.getByRole('link', { name: 'Organization', exact: true })).toBeVisible()
        // ...but the role:read-gated entry specifically did not render.
        await expect(narrowPage.getByRole('link', { name: 'Access Control', exact: true })).toHaveCount(0)
      })

      await test.step('app resource the role LACKS (prevention-policies): fails closed, not silently granted', async () => {
        await gotoConfigType(narrowPage, 'prevention-policies')
        await narrowPage.getByRole('button', { name: 'New configuration' }).first().click()
        // fetchCanvasTemplate (client/src/pages/apps/canvasTemplate.ts) surfaces the server's
        // 403 from hasAppPermission('prevention-policies','read') as this toast; the editor
        // never opens (view reverts to the list, no Save button rendered).
        await expect(narrowPage.getByText(/Failed to load canvas template/i).first()).toBeVisible()
        await expect(narrowPage.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
      })

      await test.step('GET /api/me/permissions returns exactly the granted set — nothing more, nothing less', async () => {
        const snapshot = await apiGetWithToken<{
          permissions: Array<{ resource: string; action: string; appId: string | null }>
          wildcards: { allAll: boolean; resources: string[] }
          isPlatformAdmin: boolean
        }>(request, '/me/permissions', narrowUserToken)

        expect(snapshot.isPlatformAdmin).toBe(false)
        expect(snapshot.wildcards.allAll).toBe(false)
        expect(snapshot.permissions).toHaveLength(7)

        const expected = [
          { resource: 'tag', action: 'read', appId: null },
          { resource: 'configuration-canvas', action: 'read', appId: null },
          { resource: 'configuration-canvas', action: 'write', appId: null },
          { resource: 'component', action: 'read', appId: null },
          { resource: 'host-groups', action: 'read', appId: crowdstrikeAppId },
          { resource: 'host-groups', action: 'write', appId: crowdstrikeAppId },
          { resource: 'role', action: 'write', appId: null },
        ]
        for (const grant of expected) {
          expect(
            snapshot.permissions.some(
              (p) => p.resource === grant.resource && p.action === grant.action && p.appId === grant.appId,
            ),
            `expected grant missing: ${JSON.stringify(grant)}`,
          ).toBe(true)
        }
        // And critically, no privilege escalation-relevant grant slipped in.
        expect(snapshot.permissions.some((p) => p.resource === 'all' || p.action === 'all')).toBe(false)
        expect(snapshot.permissions.some((p) => p.resource === 'role' && p.action === 'read')).toBe(false)
      })

      await test.step('privilege escalation blocked: PUT /api/roles/:id granting all:all → 403', async () => {
        const res = await csrfPutExpectingFailure(request, `/roles/${narrowRoleId}`, narrowUserToken, {
          permissions: [{ resource: 'all', action: 'all' }],
        })
        expect(res.status(), await res.text()).toBe(403)
        const body = (await res.json()) as { error?: string }
        expect(body.error ?? '').toMatch(/cannot grant permission.*you do not hold/i)

        // The role's permissions are unchanged — the guard rejected before writing anything.
        // (The narrow role has no `role:read`, so this check goes through the tenant admin.)
        const tenantAdmin = await apiLogin(tenant.adminEmail, tenant.adminPassword)
        const role = await apiGetWithToken<{
          permissions: Array<{ resource: string; action: string }>
        }>(request, `/roles/${narrowRoleId}`, tenantAdmin.token)
        expect(role.permissions.some((p) => p.resource === 'all' && p.action === 'all')).toBe(false)
      })
    } finally {
      await narrowContext.close()
    }

    await test.step('regression: the tenant Administrator (all:all) still sees everything', async () => {
      const adminContext = await browser.newContext()
      const adminPage = await adminContext.newPage()
      try {
        await loginViaUI(adminPage, tenant.adminEmail, tenant.adminPassword)
        await expect.poll(() => new URL(adminPage.url()).pathname).toBe('/')

        await adminPage.getByRole('button', { name: 'Settings', exact: true }).click()
        await expect(adminPage.getByRole('link', { name: 'Access Control', exact: true })).toBeVisible()

        // The Administrator can reach the config type the narrow role could not.
        await gotoConfigType(adminPage, 'prevention-policies')
        await adminPage.getByRole('button', { name: 'New configuration' }).first().click()
        await expect(adminPage.getByRole('button', { name: 'Save', exact: true })).toBeVisible({ timeout: 30_000 })
      } finally {
        await adminContext.close()
      }
    })

    await test.step('regression: the default admin session still sees everything', async () => {
      // `page` is this spec's already-authenticated default session — the dev fixture
      // admin (all:all) from the `chromium` project's storageState.json (see
      // playwright.config.ts). Kept as a regression that an unrestricted admin is
      // unaffected by the narrow role created above.
      await page.goto('/')
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page.getByRole('link', { name: 'Access Control', exact: true })).toBeVisible()
    })
  })
})

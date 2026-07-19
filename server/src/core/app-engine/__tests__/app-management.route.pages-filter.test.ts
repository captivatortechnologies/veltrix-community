// ========================================================================
// Tests: filterPagesByPermission (R3, RBAC/IdP hardening 2026-07-10)
//
// GET /api/apps/enabled server-side filters manifest.client.pages by each
// page's requiresPermission, so a user is never even told about a page
// their role can't use. Exercised as a pure function against
// buildPermissionSnapshot output (already covered by lib/permissions tests)
// to keep this test independent of booting the full app-management route
// module (15 endpoints' worth of unrelated dependencies).
// ========================================================================

import { filterPagesByPermission } from '../app-management.route'
import { buildPermissionSnapshot } from '../../../lib/permissions'
import type { AppPageDeclaration } from '../../../../../shared/types/app'

const APP_ID = 'splunk-enterprise'

const pages: AppPageDeclaration[] = [
  { path: '/indexes', component: 'IndexesPage', label: 'Indexes', requiresPermission: { resource: 'indexes', action: 'read' } },
  { path: '/roles', component: 'RolesPage', label: 'Roles', requiresPermission: { resource: 'roles', action: 'read' } },
  { path: '/about', component: 'AboutPage', label: 'About' }, // no requiresPermission -> always shown
]

describe('filterPagesByPermission', () => {
  it('keeps every page for a platform admin', () => {
    const snapshot = buildPermissionSnapshot([], true)
    expect(filterPagesByPermission(pages, APP_ID, snapshot)).toHaveLength(3)
  })

  it('keeps every page for a role holding all:all', () => {
    const snapshot = buildPermissionSnapshot([{ id: 'p1', resource: 'all', action: 'all', roleId: 'r1', appId: null }], false)
    expect(filterPagesByPermission(pages, APP_ID, snapshot)).toHaveLength(3)
  })

  it('drops a gated page the user has no permission for, keeps the ungated one', () => {
    const snapshot = buildPermissionSnapshot([], false)
    const result = filterPagesByPermission(pages, APP_ID, snapshot)
    expect(result.map((p) => p.path)).toEqual(['/about'])
  })

  it('keeps a gated page when the user holds the exact app-scoped permission', () => {
    const snapshot = buildPermissionSnapshot(
      [{ id: 'p1', resource: 'indexes', action: 'read', roleId: 'r1', appId: APP_ID }],
      false,
    )
    const result = filterPagesByPermission(pages, APP_ID, snapshot)
    expect(result.map((p) => p.path)).toEqual(['/indexes', '/about'])
  })

  it('a platform-scoped grant of the same resource/action also unlocks the page (decision 2)', () => {
    const snapshot = buildPermissionSnapshot(
      [{ id: 'p1', resource: 'indexes', action: 'read', roleId: 'r1', appId: null }],
      false,
    )
    const result = filterPagesByPermission(pages, APP_ID, snapshot)
    expect(result.map((p) => p.path)).toEqual(['/indexes', '/about'])
  })

  it('does NOT unlock a page gated for a DIFFERENT app with the same resource/action', () => {
    const snapshot = buildPermissionSnapshot(
      [{ id: 'p1', resource: 'indexes', action: 'read', roleId: 'r1', appId: 'some-other-app' }],
      false,
    )
    const result = filterPagesByPermission(pages, APP_ID, snapshot)
    expect(result.map((p) => p.path)).toEqual(['/about'])
  })

  it('resource:all unlocks every action-gated page for that resource', () => {
    const snapshot = buildPermissionSnapshot(
      [{ id: 'p1', resource: 'indexes', action: 'all', roleId: 'r1', appId: APP_ID }],
      false,
    )
    const result = filterPagesByPermission(pages, APP_ID, snapshot)
    expect(result.map((p) => p.path)).toEqual(['/indexes', '/about'])
  })
})

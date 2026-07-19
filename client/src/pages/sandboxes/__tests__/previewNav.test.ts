import { describe, it, expect } from 'vitest'
import { resolvePreviewNav, isFullBleed } from '../previewNav'
import type { AppPageDeclaration } from '../../../../../shared/types/app'

// Fictional page names throughout — proves resolvePreviewNav is driven
// entirely by the manifest contract, never hardcoded to any particular app.

function page(overrides: Partial<AppPageDeclaration> & Pick<AppPageDeclaration, 'path' | 'component' | 'label'>): AppPageDeclaration {
  return { ...overrides }
}

describe('resolvePreviewNav', () => {
  it('includes only nav: "sidebar" pages as top-level switcher entries', () => {
    const pages: AppPageDeclaration[] = [
      page({ path: '/widgets', component: 'WidgetsPage', label: 'Widgets', nav: 'sidebar' }),
      page({ path: '/widgets/detail', component: 'WidgetDetailPage', label: 'Detail', nav: 'tab', parent: '/widgets' }),
      page({ path: '/secret-diagnostics', component: 'DiagnosticsPage', label: 'Diagnostics', nav: 'hidden' }),
    ]

    const entries = resolvePreviewNav(pages)

    expect(entries.map((e) => e.page.path)).toEqual(['/widgets'])
  })

  it('orders top-level entries by "order" ascending, ties broken by label', () => {
    const pages: AppPageDeclaration[] = [
      page({ path: '/zeta', component: 'ZetaPage', label: 'Zeta', nav: 'sidebar', order: 1 }),
      page({ path: '/alpha', component: 'AlphaPage', label: 'Alpha', nav: 'sidebar', order: 1 }),
      page({ path: '/beta', component: 'BetaPage', label: 'Beta', nav: 'sidebar', order: 0 }),
    ]

    const entries = resolvePreviewNav(pages)

    // order:0 first, then order:1 entries tie-broken alphabetically by label.
    expect(entries.map((e) => e.page.label)).toEqual(['Beta', 'Alpha', 'Zeta'])
  })

  it('nests nav: "tab" pages under the sidebar entry whose path matches their parent', () => {
    const pages: AppPageDeclaration[] = [
      page({ path: '/gizmos', component: 'GizmosPage', label: 'Gizmos', nav: 'sidebar' }),
      page({ path: '/gizmos/history', component: 'GizmoHistoryPage', label: 'History', nav: 'tab', parent: '/gizmos', order: 2 }),
      page({ path: '/gizmos/settings', component: 'GizmoSettingsPage', label: 'Settings', nav: 'tab', parent: '/gizmos', order: 1 }),
      page({ path: '/widgets', component: 'WidgetsPage', label: 'Widgets', nav: 'sidebar' }),
    ]

    const entries = resolvePreviewNav(pages)
    const gizmos = entries.find((e) => e.page.path === '/gizmos')
    const widgets = entries.find((e) => e.page.path === '/widgets')

    expect(gizmos?.tabs.map((t) => t.label)).toEqual(['Settings', 'History']) // ordered by `order`
    expect(widgets?.tabs).toEqual([])
  })

  it('drops a tab page whose parent is not a sidebar entry (orphaned tab)', () => {
    const pages: AppPageDeclaration[] = [
      page({ path: '/orphan-tab', component: 'OrphanPage', label: 'Orphan', nav: 'tab', parent: '/does-not-exist' }),
    ]

    expect(resolvePreviewNav(pages)).toEqual([])
  })

  it('falls back to the legacy `sidebar: true` boolean when `nav` is undefined', () => {
    const pages: AppPageDeclaration[] = [
      { path: '/legacy', component: 'LegacyPage', label: 'Legacy', sidebar: true } as AppPageDeclaration,
      { path: '/legacy-hidden', component: 'LegacyHiddenPage', label: 'Legacy hidden' } as AppPageDeclaration,
    ]

    const entries = resolvePreviewNav(pages)

    expect(entries.map((e) => e.page.path)).toEqual(['/legacy'])
  })

  it('returns [] for an empty page list', () => {
    expect(resolvePreviewNav([])).toEqual([])
  })
})

describe('isFullBleed', () => {
  it('is true only when layout is "full-bleed"', () => {
    expect(isFullBleed(page({ path: '/a', component: 'A', label: 'A', layout: 'full-bleed' }))).toBe(true)
    expect(isFullBleed(page({ path: '/a', component: 'A', label: 'A', layout: 'standard' }))).toBe(false)
    expect(isFullBleed(page({ path: '/a', component: 'A', label: 'A' }))).toBe(false)
    expect(isFullBleed(undefined)).toBe(false)
  })
})

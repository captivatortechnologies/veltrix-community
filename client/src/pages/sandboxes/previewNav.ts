import type { AppPageDeclaration } from '../../../../shared/types/app'
import { effectiveNav } from '../../components/ui/sidebar/resolveSidebarNav'

// ============================================================================
// Sandbox preview nav resolution (S6.5)
//
// Turns a manifest's `client.pages[]` (shared/types/app.ts AppPageDeclaration,
// the same contract installed apps use) into the Preview surface's page
// switcher: `nav: 'sidebar'` pages become top-level switcher entries (ordered
// by `order`, ties broken by `label` — identical rule to
// resolveSidebarNav.resolveSidebarAppGroups, reused via `effectiveNav` so the
// two nav trees can never diverge on what counts as a sidebar page).
// `nav: 'tab'` pages nest as tabs under the sidebar entry whose `path`
// matches their `parent`. `nav: 'hidden'` pages are routable-but-unlisted —
// the preview never lists them (no deep-linking UI exists here to reach
// them, matching the plan's "in preview, just not listed").
//
// `requiresPermission` gating is DELIBERATELY not enforced here: the client
// has no general-purpose way to check `{resource, action}` pairs against the
// signed-in user yet (see resolveSidebarAppGroups' identical doc comment —
// authStore.hasPermission takes a single already-combined permission string
// with no established `resource:action` join convention). Pages requiring a
// permission are shown unconditionally, exactly like the main sidebar does,
// rather than guessing a format.
// ============================================================================

export interface PreviewNavEntry {
  /** The sidebar-nav page itself — its own component is the entry's default view. */
  page: AppPageDeclaration
  /** nav: 'tab' pages whose `parent` matches this entry's page path, in display order. */
  tabs: AppPageDeclaration[]
}

function byOrderThenLabel(a: AppPageDeclaration, b: AppPageDeclaration): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label)
}

/**
 * Resolve one app's declared pages into the preview's nav tree. Pages with
 * no resolvable component are still included — SandboxPreviewCard is
 * responsible for reporting a page whose `component` the bundle doesn't
 * export (mirrors AppPageHost's "bundle out of date" messaging).
 */
export function resolvePreviewNav(pages: AppPageDeclaration[]): PreviewNavEntry[] {
  const sidebarPages = pages.filter((page) => effectiveNav(page) === 'sidebar').sort(byOrderThenLabel)
  const tabPages = pages.filter((page) => effectiveNav(page) === 'tab')

  return sidebarPages.map((page) => ({
    page,
    tabs: tabPages.filter((tab) => tab.parent === page.path).sort(byOrderThenLabel),
  }))
}

/** True when a page's declared layout removes the preview's own content padding. */
export function isFullBleed(page: AppPageDeclaration | undefined): boolean {
  return page?.layout === 'full-bleed'
}

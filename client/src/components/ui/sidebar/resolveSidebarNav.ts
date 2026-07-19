import type { EnabledApp } from '../../../services/appService';
import type { AppPageDeclaration, AppPageNav } from '../../../../../shared/types/app';

export interface ResolvedSidebarPage extends AppPageDeclaration {
  appId: string;
  appName: string;
  /** The installed app's own icon (emoji/string), for the icon fallback chain. */
  appIcon?: string;
}

export interface SidebarNavSection {
  /** Optional sub-section label from `AppPageDeclaration.group`; undefined = ungrouped. */
  group?: string;
  pages: ResolvedSidebarPage[];
}

export interface AppNavGroup {
  appId: string;
  appName: string;
  appIcon?: string;
  sections: SidebarNavSection[];
}

export interface ResolveSidebarNavOptions {
  /**
   * Permission check used to gate pages with `requiresPermission` (backed by
   * `usePermissions()`, src/hooks/usePermissions.ts — see design decision 5,
   * `_ai_tasks/rbac-idp-hardening/2026-07-10/01_plan.md`). `opts.appId`
   * receives the owning app's id so app-scoped checks resolve correctly
   * (design decision 2: an app-scoped check is also satisfied by a platform
   * wildcard). FAIL-CLOSED: when omitted, a `requiresPermission` page is
   * hidden, not shown - every caller must pass a real checker.
   */
  hasPermission?: (resource: string, action: string, opts?: { appId?: string | null }) => boolean;
}

/**
 * `AppPageDeclaration.sidebar` (boolean) is deprecated in favor of `nav`.
 * Manifests written against the old contract only set `sidebar`; the server
 * is expected to backfill `nav` from it, but this stays resilient even if a
 * raw/legacy payload reaches the client directly.
 */
/**
 * Exported so other nav-contract consumers (e.g. the sandbox preview's own
 * page switcher/tabs, pages/sandboxes/previewNav.ts) apply the identical
 * sidebar/tab/hidden + legacy-`sidebar`-boolean fallback rule rather than
 * re-deriving it.
 */
export function effectiveNav(page: AppPageDeclaration): AppPageNav {
  return page.nav ?? (page.sidebar ? 'sidebar' : 'hidden');
}

function isVisible(
  page: AppPageDeclaration,
  appId: string,
  hasPermission?: ResolveSidebarNavOptions['hasPermission'],
): boolean {
  if (effectiveNav(page) !== 'sidebar') return false;
  if (!page.requiresPermission) return true;
  // FAIL-CLOSED (design decision 5): no permission source, or the check
  // itself denies -> hidden. A requiresPermission page must never render on
  // an absent/not-wired checker.
  if (!hasPermission) return false;
  return hasPermission(page.requiresPermission.resource, page.requiresPermission.action, { appId });
}

/**
 * Resolves each installed app's manifest-declared pages into the sidebar
 * navigation contract described in shared/types/app.ts:
 *  - only `nav: 'sidebar'` pages (or legacy `sidebar: true`) are included
 *    (`nav: 'tab'` pages live inside their parent page instead)
 *  - pages nest under their owning app (never flattened at the root)
 *  - pages are sorted by `order` ascending, ties broken by `label`
 *  - `group` buckets pages into sub-sections within an app, in the order
 *    each group first appears once the pages are sorted
 *  - `requiresPermission` FAIL-CLOSED gates the entry: hidden unless a
 *    permission source is passed AND it grants the declared resource/action
 *
 * Apps that contribute no visible pages are omitted entirely.
 */
export function resolveSidebarAppGroups(
  enabledApps: EnabledApp[],
  options: ResolveSidebarNavOptions = {}
): AppNavGroup[] {
  const { hasPermission } = options;

  return enabledApps
    .map((app): AppNavGroup => {
      const pages: ResolvedSidebarPage[] = (app.pages || [])
        .filter((page) => isVisible(page, app.appId, hasPermission))
        .map((page) => ({ ...page, appId: app.appId, appName: app.name, appIcon: app.icon }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));

      const sections: SidebarNavSection[] = [];
      const sectionIndexByGroup = new Map<string | undefined, number>();

      pages.forEach((page) => {
        const key = page.group;
        let index = sectionIndexByGroup.get(key);
        if (index === undefined) {
          index = sections.push({ group: key, pages: [] }) - 1;
          sectionIndexByGroup.set(key, index);
        }
        sections[index].pages.push(page);
      });

      return { appId: app.appId, appName: app.name, appIcon: app.icon, sections };
    })
    .filter((group) => group.sections.some((section) => section.pages.length > 0));
}

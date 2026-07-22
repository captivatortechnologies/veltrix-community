// ========================================================================
// AppShell — the shared branded chrome for any enabled app's surfaces.
//
// Extracted from AppPageHost so BOTH the app-bundle pages (/apps/:appId/*)
// and the generic Configuration Canvas pages (/apps/:appId/config/:configTypeId)
// render the SAME per-app navbar: [logo] [app name] [tabs], with the brand
// accent (--veltrix-app-primary) scoped to this subtree only.
//
// Nav items come from TWO manifest sources, unified here:
//   • the app's declared client pages (nav tabs), and
//   • the app's configurationTypes (one tab each -> the config authoring page).
//
// ZERO app-specific knowledge — everything is driven by the EnabledApp record.
// ========================================================================

import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { EnabledApp, EnabledAppBranding } from '../../services/appService'
import type { AppPageDeclaration } from '../../../../shared/types/app'
import { Badge } from '../../components/shared/Badge'
import { ToastProvider } from '../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../components/shared/ConfirmationDialog'
import { resolveAppPageIcon, resolveConfigGroupIcon } from '../../components/ui/sidebar/sidebarIcons'

/** Platform neutral accent (indigo-600) used when an app declares no brand color. */
export const PLATFORM_NEUTRAL_ACCENT = '#4f46e5'

/** CSS custom properties scoping the brand palette to the app subtree. */
export function brandVariables(branding: EnabledAppBranding | undefined): React.CSSProperties {
  const primary = branding?.primaryColor ?? PLATFORM_NEUTRAL_ACCENT
  const accent = branding?.accentColor ?? primary
  return {
    '--veltrix-app-primary': primary,
    '--veltrix-app-accent': accent,
  } as React.CSSProperties
}

// ---------------------------------------------------------------------------
// Brand-token bridge
//
// The shared design-system components read `--color-primary` and its family as
// SPACE-SEPARATED RGB TRIPLES (e.g. `37 99 235`) so Tailwind opacity modifiers
// work (`rgb(var(--color-primary) / <alpha-value>)`; see src/styles/tokens.css).
// App branding, however, arrives as a hex string. `brandTokenStyle` converts a
// valid brand hex into that token family and scopes it to the app container, so
// the whole kit (buttons, tabs, checkboxes, spinners, …) renders in the app's
// brand color. When no valid primary is present it emits nothing, leaving the
// Veltrix default `--color-primary` in force.
// ---------------------------------------------------------------------------

/** Parse a `#RGB` or `#RRGGBB` string into an `[r, g, b]` triple; null when invalid. */
export function parseHexColor(hex: string | undefined): [number, number, number] | null {
  if (!hex) return null
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return null
  const digits = match[1]
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

const clampChannel = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))

/** Format a triple as the space-separated string the token machinery expects. */
const tripleToString = (rgb: [number, number, number]): string => rgb.map(clampChannel).join(' ')

/** Darken each channel toward black by `amount` (0–1) — used for hover/active shades. */
function darken([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r * (1 - amount), g * (1 - amount), b * (1 - amount)]
}

/** Mix each channel toward white by `amount` (0–1) — produces a light "subtle" tint. */
function mixWhite([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]
}

/** True when the color is very light (relative-luminance proxy on 0–255 channels). */
function isVeryLight([r, g, b]: [number, number, number]): boolean {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6
}

/**
 * Emit the `--color-primary` token family for the app's brand color. Returns an
 * empty object (no override) when `primaryHex` is missing/invalid, so the kit
 * keeps its Veltrix default. `accentHex` is accepted for signature completeness
 * and reserved for a future accent token family (the design system currently has
 * no `--color-accent`), hence the underscore.
 */
export function brandTokenStyle(primaryHex?: string, _accentHex?: string): React.CSSProperties {
  const primary = parseHexColor(primaryHex)
  if (!primary) return {}
  // Dark near-black text on very light brands, white otherwise (contrast).
  const foreground: [number, number, number] = isVeryLight(primary) ? [17, 24, 39] : [255, 255, 255]
  return {
    '--color-primary': tripleToString(primary),
    '--color-primary-hover': tripleToString(darken(primary, 0.1)),
    '--color-primary-active': tripleToString(darken(primary, 0.2)),
    '--color-primary-foreground': tripleToString(foreground),
    '--color-primary-subtle': tripleToString(mixWhite(primary, 0.85)),
    '--color-primary-subtle-foreground': tripleToString(primary),
  } as React.CSSProperties
}

/**
 * A single navbar tab. `path` is the route suffix AFTER /apps/:appId (e.g.
 * '/dashboard' or '/config/host-groups'); the shell builds the full href.
 */
export interface AppNavItem {
  path: string
  label: string
  group?: 'page' | 'config' | 'settings'
  /**
   * Optional sub-section label WITHIN a group (today only configuration types
   * use it, via the manifest `group` field). When a group's items carry this,
   * the sidebar clusters them under collapsible sub-groups; absent → flat list.
   */
  subgroup?: string
  /**
   * Manifest page icon identifier (a Lucide name, e.g. "database"), used to
   * render an icon for this item in the collapsed rail. Absent for configuration
   * types (which declare none) — those fall back to a distinguishable initials
   * badge rather than a shared glyph.
   */
  icon?: string
}

/**
 * Permission check used to filter tabs whose page declares
 * `requiresPermission` (Wave C, RBAC/IdP hardening 2026-07-10 — design
 * decision 5). FAIL-CLOSED: a `requiresPermission` page is excluded unless a
 * checker is passed AND it grants the declared resource/action, scoped to
 * this app's id (design decision 2: an app-scoped check is also satisfied by
 * a platform wildcard). The server already filters `GET /api/apps/enabled`
 * to permitted pages (R3) — this is defense-in-depth against stale/cached
 * app data, not the primary enforcement.
 */
export type AppNavPermissionCheck = (resource: string, action: string, opts?: { appId?: string | null }) => boolean

function isPageNavPermitted(
  page: AppPageDeclaration,
  appId: string,
  hasPermission?: AppNavPermissionCheck,
): boolean {
  if (!page.requiresPermission) return true
  if (!hasPermission) return false
  return hasPermission(page.requiresPermission.resource, page.requiresPermission.action, { appId })
}

/** App pages that surface as navbar tabs, in their manifest-declared order. */
function navbarPageTabs(
  pages: AppPageDeclaration[],
  appId: string,
  hasPermission?: AppNavPermissionCheck,
): AppPageDeclaration[] {
  return pages
    .filter((page) => (page.nav ? page.nav === 'sidebar' || page.nav === 'tab' : page.sidebar !== false))
    // A `nav: 'tab'` page with a `parent` is an IN-PAGE tab of that parent
    // (e.g. a configuration type's "Defaults" tab) — it renders inside the
    // parent surface, not as its own top-level nav item.
    .filter((page) => !(page.nav === 'tab' && page.parent))
    .filter((page) => isPageNavPermitted(page, appId, hasPermission))
    .map((page, index) => ({ page, index }))
    .sort(
      (a, b) =>
        (a.page.order ?? a.index) - (b.page.order ?? b.index) ||
        a.page.label.localeCompare(b.page.label),
    )
    .map(({ page }) => page)
}

/**
 * Unified nav items for an app: its client-page tabs followed by one tab per
 * configuration type (linking to the generic config authoring page).
 * `hasPermission` FAIL-CLOSED gates any `requiresPermission` page tab.
 */
export function buildAppNavItems(app: EnabledApp, hasPermission?: AppNavPermissionCheck): AppNavItem[] {
  const pageItems: AppNavItem[] = navbarPageTabs(app.pages ?? [], app.appId, hasPermission).map((page) => ({
    path: page.path,
    label: page.label,
    // A page can opt into the "Configurations" or "Settings" group via `group`
    // in the manifest (e.g. management pages beside the config types, or
    // app-level Settings like Access Servers / Connections); otherwise "Pages".
    group: page.group === 'config' ? 'config' : page.group === 'settings' ? 'settings' : 'page',
    icon: page.icon,
  }))
  const configItems: AppNavItem[] = (app.configurationTypes ?? []).map((ct) => ({
    path: `/config/${ct.id}`,
    label: ct.name,
    group: 'config',
    // Manifest-declared sub-section label; drives collapsible groups in the
    // sidebar for config-heavy apps (undefined → the type stays in a flat list).
    subgroup: ct.group,
  }))
  // Platform-provided page: every app gets a Pipeline surface (the CI/CD
  // pipeline for every configuration across every configuration type),
  // regardless of what the app's own manifest declares. It lives in the
  // Pages group, alongside the app's own page tabs (Overview, Setup Guide, …).
  const platformPageItems: AppNavItem[] = [
    { path: '/pipeline', label: 'Pipeline', group: 'page', icon: 'activity' },
  ]
  // Order the flat tab strip (and thus the sidebar reading order) as
  // Pages -> Configurations -> Settings so Settings always trails.
  const pages = [...pageItems.filter((i) => i.group === 'page'), ...platformPageItems]
  const settings = pageItems.filter((i) => i.group === 'settings')
  const configs = [...pageItems.filter((i) => i.group === 'config'), ...configItems]
  return [...pages, ...configs, ...settings]
}

/** Full href for a nav item: /apps/:appId + the item's route suffix. */
const navItemHref = (app: EnabledApp, item: AppNavItem): string => `/apps/${app.appId}${item.path}`

/** A nav item is active when its route suffix matches the shell's activePath. */
const isNavItemActive = (item: AppNavItem, activePath: string | null): boolean =>
  item.path === activePath

/** A stable React key for a nav item, disambiguated by its group. */
const navItemKey = (item: AppNavItem): string => `${item.group ?? 'page'}:${item.path}`

/**
 * The app's logo image(s): light logo (hidden in dark mode when a dark variant
 * exists) and an optional dark variant. Shared by both nav layouts so the app
 * identity renders identically in the tab strip and the sidebar rail.
 */
const AppLogo: React.FC<{ app: EnabledApp }> = ({ app }) => {
  const logoUrl = app.branding?.logoUrl
  const logoDarkUrl = app.branding?.logoDarkUrl
  return (
    <>
      {logoUrl && (
        <img
          src={logoUrl}
          alt={`${app.name} logo`}
          className={`h-7 w-auto${logoDarkUrl ? ' dark:hidden' : ''}`}
        />
      )}
      {logoDarkUrl && (
        <img
          src={logoDarkUrl}
          alt={logoUrl ? '' : `${app.name} logo`}
          aria-hidden={logoUrl ? true : undefined}
          className="hidden h-7 w-auto dark:block"
        />
      )}
    </>
  )
}

/**
 * Right-aligned app metadata for the navbar: version, an Enabled status pill
 * (the shell only ever renders enabled apps), and a Source link to the app's
 * homepage/repository when declared. Shared by both nav layouts so every app
 * surface shows the same identity strip without each page repeating it.
 */
const AppMeta: React.FC<{ app: EnabledApp }> = ({ app }) => (
  <div className="ml-auto flex shrink-0 items-center gap-2">
    <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">v{app.version}</span>
    <Badge variant="success" size="sm" dot>
      Enabled
    </Badge>
    {app.homepage ? (
      <a
        href={app.homepage}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400 dark:hover:text-gray-200"
      >
        Source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    ) : null}
  </div>
)

/**
 * Compact per-app navbar: [logo if declared] [app name] [tabs]. The bottom
 * border and the active tab's underline take --veltrix-app-primary, so a
 * declared brand color shows here — and only here — by default. Used when the
 * app's navLayout is 'tabs' (the default).
 */
/** A nav group collapsed behind one tab, revealing its members as sub-tabs. */
interface NavTabGroup {
  label: string
  items: AppNavItem[]
}

/**
 * Split the nav for a horizontal strip.
 *
 * A strip cannot hold every configuration type an app declares — Splunk Cloud
 * alone has five — so a group of two or more collapses behind a single tab and
 * shows its members as sub-tabs beneath. A group with one item stays inline: a
 * parent tab holding a single child is pure noise. The sidebar layout needs none
 * of this, since it has the vertical room to label the groups outright.
 */
export function groupNavForTabs(navItems: AppNavItem[]): {
  tabs: Array<AppNavItem | NavTabGroup>
  groups: NavTabGroup[]
} {
  const pages = navItems.filter((item) => (item.group ?? 'page') === 'page')
  const tabs: Array<AppNavItem | NavTabGroup> = [...pages]
  const groups: NavTabGroup[] = []

  const collapsible: Array<[string, AppNavItem[]]> = [
    ['Configurations', navItems.filter((item) => item.group === 'config')],
    ['Settings', navItems.filter((item) => item.group === 'settings')],
  ]

  for (const [label, items] of collapsible) {
    if (items.length >= 2) {
      const group: NavTabGroup = { label, items }
      groups.push(group)
      tabs.push(group)
    } else {
      tabs.push(...items)
    }
  }

  return { tabs, groups }
}

const isGroup = (entry: AppNavItem | NavTabGroup): entry is NavTabGroup =>
  Array.isArray((entry as NavTabGroup).items)

const tabClass = (active: boolean) =>
  `flex items-center border-b-2 px-3 text-sm font-medium ${
    active
      ? 'text-gray-900 dark:text-gray-100'
      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
  }`

const AppNavbar: React.FC<{
  app: EnabledApp
  navItems: AppNavItem[]
  activePath: string | null
}> = ({ app, navItems, activePath }) => {
  const { tabs, groups } = groupNavForTabs(navItems)
  const activeGroup = groups.find((group) =>
    group.items.some((item) => isNavItemActive(item, activePath)),
  )

  return (
    <>
      <nav
        aria-label={`${app.name} navigation`}
        className="flex items-stretch gap-6 border-b bg-white px-4 sm:px-6 dark:bg-gray-800"
        style={{ borderBottomColor: 'var(--veltrix-app-primary)' }}
      >
        <div className="flex items-center gap-2.5 py-2.5">
          <AppLogo app={app} />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{app.name}</span>
        </div>
        {tabs.length > 0 && (
          <div className="-mb-px flex items-stretch gap-2">
            {tabs.map((entry) => {
              if (isGroup(entry)) {
                const active = entry === activeGroup
                return (
                  // The group tab leads to its first member, so it behaves like any
                  // other link rather than a menu that must be opened before it does
                  // anything.
                  <Link
                    key={`group:${entry.label}`}
                    to={navItemHref(app, entry.items[0])}
                    aria-current={active ? 'page' : undefined}
                    className={`${tabClass(active)} gap-1`}
                    style={active ? { borderBottomColor: 'var(--veltrix-app-primary)' } : undefined}
                  >
                    {entry.label}
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )
              }

              const active = isNavItemActive(entry, activePath)
              return (
                <Link
                  key={navItemKey(entry)}
                  to={navItemHref(app, entry)}
                  aria-current={active ? 'page' : undefined}
                  className={tabClass(active)}
                  style={active ? { borderBottomColor: 'var(--veltrix-app-primary)' } : undefined}
                >
                  {entry.label}
                </Link>
              )
            })}
          </div>
        )}
        <AppMeta app={app} />
      </nav>
    </>
  )
}

/**
 * Split a group's items into sub-groups by their `subgroup` label, preserving
 * first-appearance (manifest) order. Items with no `subgroup` collapse into a
 * single leading bucket labelled `null` (rendered flat, no accordion). When no
 * item declares a subgroup the result is one `null` bucket — the caller then
 * keeps the original flat rendering.
 */
export function splitSubGroups(
  items: AppNavItem[],
): Array<{ label: string | null; items: AppNavItem[] }> {
  const order: Array<string | null> = []
  const byKey = new Map<string | null, AppNavItem[]>()
  for (const item of items) {
    const key = item.subgroup ?? null
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(item)
  }
  return order.map((key) => ({ label: key, items: byKey.get(key)! }))
}

/** localStorage key for one sidebar sub-group's open/closed preference. */
const navGroupKey = (appId: string, subgroup: string): string =>
  `veltrix:appNavGroup:${appId}:${subgroup}`

/** Read a sub-group's persisted open preference (default closed; SSR-safe). */
function readNavGroupOpen(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Persist a sub-group's open/closed preference (best-effort). */
function writeNavGroupOpen(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? '1' : '0')
  } catch {
    /* storage unavailable — the in-memory toggle still works this session */
  }
}

/**
 * One sidebar link. `indented` shifts it right so it reads as a child of a
 * sub-group heading; otherwise it sits flush under a section heading. The active
 * link takes the brand accent as a left border + subtle tint.
 */
const SidebarNavLink: React.FC<{
  app: EnabledApp
  item: AppNavItem
  active: boolean
  indented?: boolean
}> = ({ app, item, active, indented }) => (
  <li>
    <Link
      to={navItemHref(app, item)}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center rounded-md border-l-2 py-1.5 text-sm font-medium ${
        indented ? 'pl-6 pr-3' : 'px-3'
      } ${
        active
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/40 dark:hover:text-gray-300'
      }`}
      style={active ? { borderLeftColor: 'var(--veltrix-app-primary)' } : undefined}
    >
      {item.label}
    </Link>
  </li>
)

/**
 * A collapsible sub-group of sidebar links (e.g. "Access Policies" under
 * "Configurations"). Starts closed unless it holds the active item or the user
 * previously opened it (persisted per app+group). The active group is always
 * forced open so the current page is never hidden behind a collapsed header.
 */
const SidebarSubGroup: React.FC<{
  app: EnabledApp
  label: string
  items: AppNavItem[]
  activePath: string | null
  containsActive: boolean
}> = ({ app, label, items, activePath, containsActive }) => {
  const storageKey = navGroupKey(app.appId, label)
  const [open, setOpen] = React.useState<boolean>(
    () => containsActive || readNavGroupOpen(storageKey),
  )
  // Navigating into this group (via a route change elsewhere) forces it open so
  // the active item is visible; it does not overwrite the stored preference.
  React.useEffect(() => {
    if (containsActive) setOpen(true)
  }, [containsActive])

  const slug = label.toLowerCase().replace(/\s+/g, '-')
  const buttonId = `app-nav-${app.appId}-group-${slug}`
  const panelId = `${buttonId}-panel`
  const toggle = () =>
    setOpen((prev) => {
      const next = !prev
      writeNavGroupOpen(storageKey, next)
      return next
    })

  return (
    <div>
      <button
        id={buttonId}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400 dark:hover:bg-gray-700/40 dark:hover:text-gray-300"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        />
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <ul id={panelId} aria-labelledby={buttonId} className="mt-0.5 flex flex-col gap-0.5">
          {items.map((item) => (
            <SidebarNavLink
              key={navItemKey(item)}
              app={app}
              item={item}
              active={isNavItemActive(item, activePath)}
              indented
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One labelled group of sidebar links (e.g. "Pages" or "Configurations"). The
 * uppercase heading names the list (via aria-labelledby) for screen readers.
 * When the items declare `subgroup` labels (config-heavy apps), they render as
 * collapsible sub-groups beneath the heading; otherwise a flat list. The active
 * link takes the brand accent as a left border + subtle tint. Renders nothing
 * when the group has no items, so empty groups leave no stray heading.
 */
const SidebarSection: React.FC<{
  app: EnabledApp
  label: string
  items: AppNavItem[]
  activePath: string | null
}> = ({ app, label, items, activePath }) => {
  if (items.length === 0) return null
  const headingId = `app-nav-${app.appId}-${label.toLowerCase().replace(/\s+/g, '-')}`
  const subGroups = splitSubGroups(items)
  const hasSubGroups = subGroups.some((group) => group.label !== null)
  return (
    <div className="px-2 py-2">
      <p
        id={headingId}
        className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
      >
        {label}
      </p>
      {hasSubGroups ? (
        <div aria-labelledby={headingId} className="mt-1 flex flex-col gap-0.5">
          {subGroups.map((group) =>
            group.label === null ? (
              // Ungrouped items sit flush under the heading, above the accordions.
              <ul key="__ungrouped" className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <SidebarNavLink
                    key={navItemKey(item)}
                    app={app}
                    item={item}
                    active={isNavItemActive(item, activePath)}
                  />
                ))}
              </ul>
            ) : (
              <SidebarSubGroup
                key={group.label}
                app={app}
                label={group.label}
                items={group.items}
                activePath={activePath}
                containsActive={group.items.some((item) => isNavItemActive(item, activePath))}
              />
            ),
          )}
        </div>
      ) : (
        <ul aria-labelledby={headingId} className="mt-1 flex flex-col gap-0.5">
          {items.map((item) => (
            <SidebarNavLink
              key={navItemKey(item)}
              app={app}
              item={item}
              active={isNavItemActive(item, activePath)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Persisted collapse preference for the embedded app sidebar. Stored globally
 * (a single user chrome preference, not per-app) so it survives navigation and
 * page refreshes; SSR/no-storage environments fall back to expanded.
 */
export const SIDEBAR_COLLAPSED_KEY = 'veltrix:appSidebarCollapsed'

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Collapse state + toggler, backed by localStorage so the choice persists. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = React.useState<boolean>(readSidebarCollapsed)
  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable — keep the in-memory toggle working anyway */
      }
      return next
    })
  }, [])
  return [collapsed, toggle]
}

/**
 * Persistent top bar for the sidebar layout: [collapse toggle] [logo] [app name].
 * Always visible — including when the rail is collapsed — so the app identity
 * (logo + name) is present on every view regardless of nav state. The toggle
 * opens/closes the rail below. Its bottom border takes the brand accent, the
 * same as the tab strip's, so branding shows consistently across both layouts.
 */
const AppHeaderBar: React.FC<{
  app: EnabledApp
  collapsed: boolean
  onToggle: () => void
}> = ({ app, collapsed, onToggle }) => (
  <header
    data-testid="app-header-bar"
    className="flex items-center gap-2.5 border-b border-gray-200 bg-white px-3 py-2.5 sm:px-4 dark:border-gray-700 dark:bg-gray-800"
    style={{ borderBottomColor: 'var(--veltrix-app-primary)' }}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      className="shrink-0 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    >
      {collapsed ? (
        <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
      ) : (
        <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
    <AppLogo app={app} />
    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
      {app.name}
    </span>
    <AppMeta app={app} />
  </header>
)

/**
 * Embedded left navigation rail: grouped, scrollable link sections ("Pages" then
 * "Configurations"). Chosen when navLayout is 'sidebar' — this scales cleanly
 * past the handful of items a horizontal tab strip can hold, since sections
 * stack vertically and the rail scrolls. The app identity (logo + name) lives in
 * the persistent {@link AppHeaderBar} above, not here, so it stays visible when
 * this rail is collapsed. Rendered only when expanded; collapsing is a pure
 * layout change in {@link AppShell} (the surface `children` are never
 * unmounted), so in-page form state is preserved across a toggle.
 */
/**
 * Split flat nav items into the three sidebar sections, in reading order. Shared
 * by the expanded {@link AppSidebar} and the collapsed {@link CollapsedNavRail}
 * so both render the same groups from a single source of truth.
 */
function splitNavGroups(navItems: AppNavItem[]): {
  pageItems: AppNavItem[]
  configItems: AppNavItem[]
  settingsItems: AppNavItem[]
} {
  return {
    pageItems: navItems.filter((item) => (item.group ?? 'page') === 'page'),
    configItems: navItems.filter((item) => item.group === 'config'),
    settingsItems: navItems.filter((item) => item.group === 'settings'),
  }
}

const AppSidebar: React.FC<{
  app: EnabledApp
  navItems: AppNavItem[]
  activePath: string | null
}> = ({ app, navItems, activePath }) => {
  const { pageItems, configItems, settingsItems } = splitNavGroups(navItems)
  return (
    <nav
      aria-label={`${app.name} navigation`}
      className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <SidebarSection app={app} label="Pages" items={pageItems} activePath={activePath} />
      <SidebarSection app={app} label="Configurations" items={configItems} activePath={activePath} />
      <SidebarSection app={app} label="Settings" items={settingsItems} activePath={activePath} />
    </nav>
  )
}

/**
 * Neutral, monochrome glyph for one collapsed-rail item. A declared manifest icon
 * renders as its Lucide line-icon; everything else (configuration types, an
 * unmapped page) falls back to a plain initial rendered in the SAME text color as
 * the icons — no colored badge, no app emoji. Kept single-tone on purpose so the
 * rail reads as one quiet column; the letter still distinguishes items without
 * introducing color. Always `aria-hidden` — the owning link carries the label.
 */
const CollapsedNavIcon: React.FC<{ item: AppNavItem; size?: number }> = ({ item, size = 18 }) => {
  const Icon = resolveAppPageIcon(item.icon)
  if (Icon) return <Icon size={size} aria-hidden="true" />
  const initial = item.label.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center font-semibold leading-none"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.72)) }}
    >
      {initial}
    </span>
  )
}

/**
 * One icon-only entry in the collapsed rail. The glyph carries no label, so the
 * full item name is exposed to both sighted users (native `title` tooltip) and
 * assistive tech (`aria-label`). Active state mirrors the expanded sidebar link:
 * a brand-accent left bar plus a subtle background — the ONLY color in the rail.
 */
const CollapsedNavLink: React.FC<{
  app: EnabledApp
  item: AppNavItem
  active: boolean
}> = ({ app, item, active }) => (
  <li>
    <Link
      to={navItemHref(app, item)}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      aria-label={item.label}
      className={`flex h-9 w-9 items-center justify-center rounded-md border-l-2 ${
        active
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/40 dark:hover:text-gray-300'
      }`}
      style={active ? { borderLeftColor: 'var(--veltrix-app-primary)' } : undefined}
    >
      <CollapsedNavIcon item={item} size={18} />
    </Link>
  </li>
)

/**
 * A cluster of items for the collapsed rail, separated from its neighbors by a
 * thin divider. When `label` is set the cluster is a manifest-declared config
 * sub-group (e.g. "WAF & Security") and renders as ONE representative tile
 * instead of one icon per member — a sub-group can hold many configuration
 * types, and stacking every one of them as its own icon in a 56px rail reads
 * as noise with no way to tell which icon belongs to which group. Absent for
 * Pages, Settings, and ungrouped configuration types, which keep the original
 * one-icon-per-item rendering.
 */
interface CollapsedNavGroup {
  key: string
  items: AppNavItem[]
  label?: string
}

/**
 * One collapsed-rail tile standing in for an ENTIRE configuration sub-group.
 * A `<button>`, not a `<Link>` — clicking it doesn't navigate anywhere itself,
 * it hands off to `onExpand` which un-collapses the rail into the full
 * sidebar AND opens this specific sub-group, so the user lands with the
 * group they clicked already showing its items (see `expandConfigGroup` in
 * {@link AppShell}). The icon is derived from the group's name via
 * `resolveConfigGroupIcon` — never a bare letter, never a stack of the
 * group's own item icons.
 */
const CollapsedNavGroupTile: React.FC<{
  label: string
  active: boolean
  onExpand: () => void
}> = ({ label, active, onExpand }) => {
  const Icon = resolveConfigGroupIcon(label)
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`Expand ${label}`}
      aria-label={`Expand ${label}`}
      className={`flex h-9 w-9 items-center justify-center rounded-md border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/40 dark:hover:text-gray-300'
      }`}
      style={active ? { borderLeftColor: 'var(--veltrix-app-primary)' } : undefined}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  )
}

/**
 * Icon-only navigation rail — the collapsed form of both the full sidebar layout
 * and the tab layout's sub-nav. Renders one icon per item for unlabelled
 * clusters (Pages, Settings, ungrouped Configurations), or one representative
 * tile per labelled config sub-group — see {@link CollapsedNavGroup} — with a
 * thin divider between clusters (the uppercase section headings are dropped
 * for width, so the divider is what preserves the separation). Scrolls
 * vertically for config-heavy apps. An optional `topSlot` hosts the expand
 * toggle when the rail owns its own toggle (the tab sub-nav); the full
 * sidebar layout keeps its toggle in the persistent header instead.
 */
const CollapsedNavRail: React.FC<{
  app: EnabledApp
  groups: CollapsedNavGroup[]
  activePath: string | null
  ariaLabel: string
  topSlot?: React.ReactNode
  /** Expands the rail and opens the named sub-group; omitted clusters have no labelled groups. */
  onExpandGroup?: (label: string) => void
}> = ({ app, groups, activePath, ariaLabel, topSlot, onExpandGroup }) => {
  const nonEmpty = groups.filter((group) => group.items.length > 0)
  return (
    <nav
      aria-label={ariaLabel}
      className="flex w-14 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      {topSlot}
      {nonEmpty.map((group, index) => (
        <React.Fragment key={group.key}>
          {index > 0 && <hr className="mx-2 my-0.5 border-gray-200 dark:border-gray-700" />}
          {group.label ? (
            <div className="flex justify-center px-2">
              <CollapsedNavGroupTile
                label={group.label}
                active={group.items.some((item) => isNavItemActive(item, activePath))}
                onExpand={() => onExpandGroup?.(group.label as string)}
              />
            </div>
          ) : (
            <ul className="flex flex-col items-center gap-1 px-2">
              {group.items.map((item) => (
                <CollapsedNavLink
                  key={navItemKey(item)}
                  app={app}
                  item={item}
                  active={isNavItemActive(item, activePath)}
                />
              ))}
            </ul>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

/**
 * Collapsible left sub-nav for the TAB layout: the active nav group's members
 * (e.g. an app's configuration types under "Configurations") as a vertical,
 * labelled list with a collapse toggle. Collapsing leaves a thin rail holding
 * just an expand button, so the surface gets full width while re-expand stays
 * one click away. Shares the persisted collapse preference with the full sidebar
 * layout (see {@link useSidebarCollapsed}).
 */
const TabsSubNavSidebar: React.FC<{
  app: EnabledApp
  group: NavTabGroup
  activePath: string | null
  collapsed: boolean
  onToggle: () => void
  onExpandGroup: (label: string) => void
}> = ({ app, group, activePath, collapsed, onToggle, onExpandGroup }) => {
  const toggleClasses =
    'rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300'

  if (collapsed) {
    // A thin icon rail: the expand toggle on top, then either one icon per
    // ungrouped member or one representative tile per labelled sub-group, so
    // items stay reachable (and their active state visible) without the full
    // labelled width.
    return (
      <CollapsedNavRail
        app={app}
        groups={splitSubGroups(group.items).map((sub) => ({
          key: sub.label ?? group.label,
          items: sub.items,
          label: sub.label ?? undefined,
        }))}
        activePath={activePath}
        ariaLabel={`${group.label} sub-navigation`}
        onExpandGroup={onExpandGroup}
        topSlot={
          <div className="flex justify-center px-2 pb-0.5">
            <button
              type="button"
              onClick={onToggle}
              aria-label={`Expand ${group.label} navigation`}
              aria-expanded={false}
              title={`Expand ${group.label} navigation`}
              className={toggleClasses}
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        }
      />
    )
  }

  return (
    <nav
      aria-label={`${group.label} sub-navigation`}
      className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex justify-end px-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Collapse ${group.label} navigation`}
          aria-expanded={true}
          title={`Collapse ${group.label} navigation`}
          className={toggleClasses}
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <SidebarSection app={app} label={group.label} items={group.items} activePath={activePath} />
    </nav>
  )
}

export interface AppShellProps {
  app: EnabledApp
  navItems: AppNavItem[]
  /** Route suffix (after /apps/:appId) of the active surface, for tab highlight. */
  activePath: string | null
  children: React.ReactNode
}

/**
 * Branded app container: scopes the brand CSS variables to this subtree (both the
 * `--veltrix-app-*` accents and, via {@link brandTokenStyle}, the design-system
 * `--color-primary` family so the shared kit renders in the app's brand color),
 * mounts the host Toast/Confirmation providers so app-bundle code calling
 * `useToast()` / `useConfirmDialog()` resolves a host context, renders the per-app
 * navigation (a horizontal tab strip or an embedded left sidebar, per the app's
 * `navLayout`), and hosts the surface body alongside it.
 */
export const AppShell: React.FC<AppShellProps> = ({ app, navItems, activePath, children }) => {
  const useSidebar = app.navLayout === 'sidebar'
  // Collapse state is hoisted here (not inside AppSidebar) so toggling only
  // re-renders the shell — `children` keep the same identity and are never
  // remounted, preserving any in-page form state across a collapse/expand.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  // Clicking a config sub-group's collapsed rail tile (CollapsedNavGroupTile)
  // must land the user on that group already open, not just on an expanded-
  // but-still-fully-collapsed sub-group. SidebarSubGroup reads its open/closed
  // preference from localStorage on mount (see readNavGroupOpen), so writing
  // the preference here — synchronously, before the collapse state flips —
  // guarantees it's already "open" by the time SidebarSubGroup mounts fresh
  // in the newly-expanded sidebar. Shared by both nav layouts: the embedded
  // sidebar's own collapsed rail, and the tab layout's collapsed sub-nav.
  const expandConfigGroup = React.useCallback(
    (label: string) => {
      writeNavGroupOpen(navGroupKey(app.appId, label), true)
      toggleCollapsed()
    },
    [app.appId, toggleCollapsed],
  )
  // Tabs layout: the active nav group's items (e.g. the configuration types under
  // "Configurations") render as a labelled LEFT sub-nav sidebar beside the
  // surface, rather than an overflowing horizontal strip. Undefined in the
  // sidebar layout (the whole nav is already a rail) or when no group is active.
  const { groups: tabGroups } = groupNavForTabs(navItems)
  const tabsActiveGroup = useSidebar
    ? undefined
    : tabGroups.find((group) => group.items.some((item) => item.path === activePath))
  // Sidebar layout, collapsed: the three sections as icon-only groups (dividers
  // stand in for the dropped section headings). Built here so the split logic
  // stays shared with the expanded AppSidebar.
  const { pageItems, configItems, settingsItems } = splitNavGroups(navItems)
  const collapsedSidebarGroups: CollapsedNavGroup[] = [
    { key: 'page', items: pageItems },
    // Config sub-groups become their own icon clusters so the divider that
    // separates them stands in for the labels dropped in the collapsed rail.
    ...splitSubGroups(configItems).map((group) => ({
      key: group.label ? `config:${group.label}` : 'config',
      items: group.items,
      label: group.label ?? undefined,
    })),
    { key: 'settings', items: settingsItems },
  ]
  return (
    <div
      data-testid="app-page-container"
      className="flex min-h-full flex-col"
      style={{
        ...brandVariables(app.branding),
        ...brandTokenStyle(app.branding?.primaryColor, app.branding?.accentColor),
      }}
    >
      <ToastProvider>
        <ConfirmationDialogProvider>
          {useSidebar ? (
            <div className="flex min-h-full flex-1 flex-col">
              <AppHeaderBar app={app} collapsed={collapsed} onToggle={toggleCollapsed} />
              <div className="flex min-h-full flex-1 flex-row">
                {collapsed ? (
                  // Collapsed: a thin icon rail (the toggle stays up in the header
                  // bar). Groups keep the Pages / Configurations / Settings split
                  // via dividers now that the section labels are dropped.
                  <CollapsedNavRail
                    app={app}
                    groups={collapsedSidebarGroups}
                    activePath={activePath}
                    ariaLabel={`${app.name} navigation`}
                    onExpandGroup={expandConfigGroup}
                  />
                ) : (
                  <AppSidebar app={app} navItems={navItems} activePath={activePath} />
                )}
                <div className="min-h-full flex-1">{children}</div>
              </div>
            </div>
          ) : (
            <>
              <AppNavbar app={app} navItems={navItems} activePath={activePath} />
              <div className="flex min-h-full flex-1 flex-row">
                {tabsActiveGroup && (
                  <TabsSubNavSidebar
                    app={app}
                    group={tabsActiveGroup}
                    activePath={activePath}
                    collapsed={collapsed}
                    onToggle={toggleCollapsed}
                    onExpandGroup={expandConfigGroup}
                  />
                )}
                <div className="min-h-full flex-1">{children}</div>
              </div>
            </>
          )}
        </ConfirmationDialogProvider>
      </ToastProvider>
    </div>
  )
}

export default AppShell

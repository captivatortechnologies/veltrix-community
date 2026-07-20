/**
 * Tests: AppShell — the shared branded chrome, and buildAppNavItems which
 * unifies an app's page tabs with one tab per configuration type.
 */

import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import { AppShell, buildAppNavItems, brandTokenStyle, parseHexColor, SIDEBAR_COLLAPSED_KEY, groupNavForTabs, splitSubGroups } from '../AppShell'
import { useToast } from '../../../components/shared/Toast'
import { useConfirmDialog } from '../../../components/shared/ConfirmationDialog'
import type { EnabledApp } from '../../../services/appService'

const app: EnabledApp = {
  appId: 'edr',
  name: 'EDR',
  version: '1.0.0',
  category: 'EDR',
  pages: [{ path: '/overview', component: 'Overview', label: 'Overview' }],
  configurationTypes: [
    { id: 'host-groups', name: 'Host Groups' },
    { id: 'prevention-policies', name: 'Prevention Policies' },
  ],
}

function renderShell(activePath: string) {
  return render(
    <MemoryRouter>
      <AppShell app={app} navItems={buildAppNavItems(app)} activePath={activePath}>
        <div>body content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

// Same app, opted into the embedded left sidebar layout, with a brand logo so
// the identity-rendering assertions have something to find.
const sidebarApp: EnabledApp = {
  ...app,
  navLayout: 'sidebar',
  branding: { primaryColor: '#2563eb', logoUrl: '/apps/edr/branding/logo' },
}

function renderSidebarShell(activePath: string) {
  return render(
    <MemoryRouter>
      <AppShell app={sidebarApp} navItems={buildAppNavItems(sidebarApp)} activePath={activePath}>
        <div>body content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

// A config-heavy app whose configuration types declare `group` labels, so the
// "Configurations" section renders as collapsible sub-groups.
const groupedApp: EnabledApp = {
  ...app,
  navLayout: 'sidebar',
  branding: { primaryColor: '#00297a' },
  configurationTypes: [
    { id: 'policies', name: 'Policies', group: 'Access' },
    { id: 'rules', name: 'Rules', group: 'Access' },
    { id: 'brands', name: 'Brands', group: 'Branding' },
    { id: 'domains', name: 'Domains', group: 'Branding' },
  ],
}

function renderGroupedShell(activePath: string) {
  return render(
    <MemoryRouter>
      <AppShell app={groupedApp} navItems={buildAppNavItems(groupedApp)} activePath={activePath}>
        <div>body content</div>
      </AppShell>
    </MemoryRouter>,
  )
}

describe('buildAppNavItems', () => {
  it('lists page tabs first (including the platform-provided Pipeline item), then one tab per configuration type', () => {
    const items = buildAppNavItems(app)
    expect(items.map((i) => i.group)).toEqual(['page', 'page', 'config', 'config'])
    expect(items.map((i) => i.path)).toEqual([
      '/overview',
      '/pipeline',
      '/config/host-groups',
      '/config/prevention-policies',
    ])
  })

  it('adds the Pipeline item to every app, even one that declares no pages of its own', () => {
    const bareApp: EnabledApp = { ...app, pages: [], configurationTypes: [] }
    const items = buildAppNavItems(bareApp)
    expect(items).toEqual([
      { path: '/pipeline', label: 'Pipeline', group: 'page', icon: 'activity' },
    ])
  })
})

describe('AppShell', () => {
  it('collapses the configuration types behind one tab, with sub-tabs beneath', () => {
    renderShell('/config/host-groups')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })
    expect(within(nav).getByText('EDR')).toBeInTheDocument()

    // A strip cannot hold every config type, so the group gets one tab that leads
    // to its first member.
    const group = within(nav).getByRole('link', { name: /Configurations/ })
    expect(group).toHaveAttribute('href', '/apps/edr/config/host-groups')

    // The config types themselves live in the sub-nav.
    const subNav = screen.getByRole('navigation', { name: 'Configurations sub-navigation' })
    expect(within(subNav).getByRole('link', { name: 'Host Groups' })).toHaveAttribute(
      'href',
      '/apps/edr/config/host-groups',
    )
    expect(within(subNav).getByRole('link', { name: 'Prevention Policies' })).toHaveAttribute(
      'href',
      '/apps/edr/config/prevention-policies',
    )

    // The app's own page tab stays inline in the primary strip.
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/apps/edr/overview',
    )
  })

  it('highlights the active sub-tab, and the group tab that owns it', () => {
    renderShell('/config/host-groups')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })
    const subNav = screen.getByRole('navigation', { name: 'Configurations sub-navigation' })

    expect(within(nav).getByRole('link', { name: /Configurations/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(subNav).getByRole('link', { name: 'Host Groups' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(subNav).getByRole('link', { name: 'Prevention Policies' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('shows no sub-nav when the active surface is not in a group', () => {
    renderShell('/overview')
    expect(
      screen.queryByRole('navigation', { name: 'Configurations sub-navigation' }),
    ).not.toBeInTheDocument()
  })

  it('renders children beneath the navbar', () => {
    renderShell('/overview')
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('defaults to the horizontal tab strip when no navLayout is declared', () => {
    renderShell('/overview')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })
    // The strip has no sidebar-style section headings...
    expect(within(nav).queryByText('Pages')).not.toBeInTheDocument()
    // ...but the config types are reachable through their group tab.
    expect(within(nav).getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Configurations/ })).toBeInTheDocument()
  })
})

describe('AppShell sidebar layout', () => {
  it('renders an embedded sidebar with grouped Pages and Configurations sections', () => {
    renderSidebarShell('/config/host-groups')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })

    // A "Pages" group listing the app's client-page tabs.
    const pages = within(nav).getByRole('list', { name: 'Pages' })
    expect(within(pages).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/apps/edr/overview',
    )

    // A "Configurations" group listing one item per configuration type.
    const configs = within(nav).getByRole('list', { name: 'Configurations' })
    expect(within(configs).getByRole('link', { name: 'Host Groups' })).toHaveAttribute(
      'href',
      '/apps/edr/config/host-groups',
    )
    expect(within(configs).getByRole('link', { name: 'Prevention Policies' })).toHaveAttribute(
      'href',
      '/apps/edr/config/prevention-policies',
    )
  })

  it('marks the active item with aria-current in sidebar mode', () => {
    renderSidebarShell('/config/host-groups')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })
    expect(within(nav).getByRole('link', { name: 'Host Groups' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Prevention Policies' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(within(nav).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('renders the app name and logo in a persistent header, inside the branded container', () => {
    renderSidebarShell('/overview')
    // Identity (logo + name) lives in the always-present top header, not the rail.
    const header = screen.getByTestId('app-header-bar')
    expect(within(header).getByText('EDR')).toBeInTheDocument()
    expect(within(header).getByRole('img', { name: 'EDR logo' })).toHaveAttribute(
      'src',
      '/apps/edr/branding/logo',
    )
    // The branded container still scopes the brand token family and accent var.
    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--color-primary').trim()).toBe('37 99 235')
    expect(container.style.getPropertyValue('--veltrix-app-primary').trim()).toBe('#2563eb')
    // The surface body still renders alongside the rail.
    expect(screen.getByText('body content')).toBeInTheDocument()
  })
})

describe('AppShell sidebar collapse', () => {
  beforeEach(() => {
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY)
  })

  it('collapses and expands the rail from the header toggle, persisting the choice', () => {
    renderSidebarShell('/overview')
    // Expanded by default: labelled section lists + links + a collapse control.
    expect(screen.getByRole('list', { name: 'Pages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Host Groups' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))

    // Collapsed: the rail becomes icon-only — the labelled section lists are
    // dropped for width, yet each item stays reachable as an icon link and the
    // header toggle flips.
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Host Groups' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument()
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(screen.getByRole('list', { name: 'Pages' })).toBeInTheDocument()
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('0')
  })

  it('keeps the app logo and name visible in the header when collapsed', () => {
    renderSidebarShell('/overview')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    // The rail is now icon-only (labelled sections dropped); the persistent
    // header still carries the identity.
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument()
    const header = screen.getByTestId('app-header-bar')
    expect(within(header).getByText('EDR')).toBeInTheDocument()
    expect(within(header).getByRole('img', { name: 'EDR logo' })).toBeInTheDocument()
  })

  it('starts collapsed when localStorage says so (persists across mounts/refresh)', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
    renderSidebarShell('/overview')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeInTheDocument()
    // Icon-only from the start: labelled sections absent, items still reachable.
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Host Groups' })).toBeInTheDocument()
  })

  it('renders an icon link per item when collapsed — full label as accessible name, active one marked', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
    renderSidebarShell('/config/host-groups')
    const rail = screen.getByRole('navigation', { name: 'EDR navigation' })
    // Icon-only: the labelled section headings are dropped for width...
    expect(within(rail).queryByRole('list', { name: 'Configurations' })).not.toBeInTheDocument()
    // ...but every item stays reachable, its full name exposed as the link's
    // accessible name (aria-label) even though only an icon is shown.
    expect(within(rail).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/apps/edr/overview',
    )
    const active = within(rail).getByRole('link', { name: 'Host Groups' })
    expect(active).toHaveAttribute('href', '/apps/edr/config/host-groups')
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(within(rail).getByRole('link', { name: 'Prevention Policies' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('keeps the surface body mounted across a collapse toggle (no state loss)', () => {
    renderSidebarShell('/overview')
    // A live input in the body carries state that must survive a toggle.
    const body = screen.getByText('body content')
    const input = document.createElement('input')
    input.setAttribute('data-testid', 'live-input')
    body.appendChild(input)
    ;(input as HTMLInputElement).value = 'unsaved edit'

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }))

    // Same DOM node — React never remounted the body — so its value is intact.
    expect(screen.getByTestId('live-input')).toBe(input)
    expect((screen.getByTestId('live-input') as HTMLInputElement).value).toBe('unsaved edit')
  })
})

describe('splitSubGroups', () => {
  it('clusters items by their subgroup label, preserving first-appearance order', () => {
    const groups = splitSubGroups([
      { path: '/config/a', label: 'A', group: 'config', subgroup: 'One' },
      { path: '/config/b', label: 'B', group: 'config', subgroup: 'Two' },
      { path: '/config/c', label: 'C', group: 'config', subgroup: 'One' },
    ])
    expect(groups.map((g) => g.label)).toEqual(['One', 'Two'])
    expect(groups[0].items.map((i) => i.label)).toEqual(['A', 'C'])
    expect(groups[1].items.map((i) => i.label)).toEqual(['B'])
  })

  it('puts items with no subgroup into a single leading null bucket', () => {
    const groups = splitSubGroups([
      { path: '/config/a', label: 'A', group: 'config' },
      { path: '/config/b', label: 'B', group: 'config', subgroup: 'One' },
      { path: '/config/c', label: 'C', group: 'config' },
    ])
    expect(groups.map((g) => g.label)).toEqual([null, 'One'])
    expect(groups[0].items.map((i) => i.label)).toEqual(['A', 'C'])
  })
})

describe('AppShell sidebar sub-groups', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders each declared config group as a collapsible sub-section under Configurations', () => {
    renderGroupedShell('/overview')
    const nav = screen.getByRole('navigation', { name: 'EDR navigation' })
    // The section heading stays; each declared group is its own disclosure button.
    expect(within(nav).getByText('Configurations')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Access' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Branding' })).toBeInTheDocument()
  })

  it('opens only the group holding the active item; others start collapsed', () => {
    renderGroupedShell('/config/policies')
    const access = screen.getByRole('button', { name: 'Access' })
    const branding = screen.getByRole('button', { name: 'Branding' })
    expect(access).toHaveAttribute('aria-expanded', 'true')
    expect(branding).toHaveAttribute('aria-expanded', 'false')
    // The active group's items are visible and the active one is marked...
    expect(screen.getByRole('link', { name: 'Policies' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Rules' })).toBeInTheDocument()
    // ...while the collapsed group's items are absent from the DOM.
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument()
  })

  it('expands a collapsed group on click and persists the preference', () => {
    renderGroupedShell('/config/policies')
    const branding = screen.getByRole('button', { name: 'Branding' })
    expect(screen.queryByRole('link', { name: 'Brands' })).not.toBeInTheDocument()

    fireEvent.click(branding)

    expect(branding).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Brands' })).toHaveAttribute(
      'href',
      '/apps/edr/config/brands',
    )
    expect(window.localStorage.getItem('veltrix:appNavGroup:edr:Branding')).toBe('1')
  })

  it('restores a persisted-open group on mount even when it is not active', () => {
    window.localStorage.setItem('veltrix:appNavGroup:edr:Branding', '1')
    renderGroupedShell('/config/policies')
    expect(screen.getByRole('button', { name: 'Branding' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Brands' })).toBeInTheDocument()
  })

  it('keeps every config item reachable as an icon when collapsed, regardless of group', () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
    renderGroupedShell('/config/policies')
    const rail = screen.getByRole('navigation', { name: 'EDR navigation' })
    // Icon-only rail: no disclosure buttons, but every item across both sub-groups
    // is present as an icon link (the collapsed rail is not gated by open state).
    expect(within(rail).queryByRole('button', { name: 'Access' })).not.toBeInTheDocument()
    for (const name of ['Policies', 'Rules', 'Brands', 'Domains']) {
      expect(within(rail).getByRole('link', { name })).toBeInTheDocument()
    }
  })
})

// A child that only renders when BOTH host-mounted providers are present —
// each hook throws outside its provider, so a successful render proves AppShell
// wraps the app subtree in ToastProvider + ConfirmationDialogProvider.
const ProviderProbe: React.FC = () => {
  const toast = useToast()
  const { confirm } = useConfirmDialog()
  return (
    <div>
      <span>probe ok</span>
      <span>{typeof toast.success === 'function' ? 'has-toast' : 'no-toast'}</span>
      <span>{typeof confirm === 'function' ? 'has-confirm' : 'no-confirm'}</span>
    </div>
  )
}

describe('AppShell host providers', () => {
  it('mounts ToastProvider and ConfirmationDialogProvider around the app subtree', () => {
    render(
      <MemoryRouter>
        <AppShell app={app} navItems={buildAppNavItems(app)} activePath="/overview">
          <ProviderProbe />
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByText('probe ok')).toBeInTheDocument()
    expect(screen.getByText('has-toast')).toBeInTheDocument()
    expect(screen.getByText('has-confirm')).toBeInTheDocument()
  })

  it('scopes the brand-token family onto the branded container when the app declares a primary color', () => {
    const branded: EnabledApp = { ...app, branding: { primaryColor: '#2563eb' } }
    render(
      <MemoryRouter>
        <AppShell app={branded} navItems={buildAppNavItems(branded)} activePath="/overview">
          <div>x</div>
        </AppShell>
      </MemoryRouter>,
    )
    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--color-primary').trim()).toBe('37 99 235')
    // The legacy scoped accent var is still emitted alongside the token family.
    expect(container.style.getPropertyValue('--veltrix-app-primary').trim()).toBe('#2563eb')
  })

  it('emits no --color-primary override when the app declares no branding', () => {
    render(
      <MemoryRouter>
        <AppShell app={app} navItems={buildAppNavItems(app)} activePath="/overview">
          <div>x</div>
        </AppShell>
      </MemoryRouter>,
    )
    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--color-primary')).toBe('')
  })
})

describe('parseHexColor', () => {
  it('parses #RRGGBB into an [r,g,b] triple', () => {
    expect(parseHexColor('#2563eb')).toEqual([37, 99, 235])
  })

  it('expands #RGB shorthand', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255])
    expect(parseHexColor('#f00')).toEqual([255, 0, 0])
  })

  it('trims surrounding whitespace', () => {
    expect(parseHexColor('  #000000  ')).toEqual([0, 0, 0])
  })

  it('returns null for invalid or missing input', () => {
    expect(parseHexColor(undefined)).toBeNull()
    expect(parseHexColor('')).toBeNull()
    expect(parseHexColor('blue')).toBeNull()
    expect(parseHexColor('#12')).toBeNull()
    expect(parseHexColor('#12345')).toBeNull()
    expect(parseHexColor('2563eb')).toBeNull()
  })
})

describe('brandTokenStyle', () => {
  it('emits the full --color-primary family for a valid hex, as space-separated RGB triples', () => {
    const style = brandTokenStyle('#2563eb') as Record<string, string>
    expect(style['--color-primary']).toBe('37 99 235')
    // hover ~10% darker, active ~20% darker (rounded per-channel).
    expect(style['--color-primary-hover']).toBe('33 89 212')
    expect(style['--color-primary-active']).toBe('30 79 188')
    // A saturated blue is not "very light" -> white foreground.
    expect(style['--color-primary-foreground']).toBe('255 255 255')
    // subtle-foreground is the brand triple itself.
    expect(style['--color-primary-subtle-foreground']).toBe('37 99 235')
    // subtle is a light tint (mixed strongly toward white).
    expect(style['--color-primary-subtle']).toBe('222 232 252')
  })

  it('chooses a dark foreground for a very light brand color', () => {
    const style = brandTokenStyle('#ffffff') as Record<string, string>
    expect(style['--color-primary']).toBe('255 255 255')
    expect(style['--color-primary-foreground']).toBe('17 24 39')
  })

  it('returns an empty object (no override) for missing or invalid primary', () => {
    expect(brandTokenStyle(undefined)).toEqual({})
    expect(brandTokenStyle('not-a-color')).toEqual({})
    expect(brandTokenStyle('#xyz')).toEqual({})
  })
})

describe('groupNavForTabs', () => {
  const items = [
    { path: '/overview', label: 'Overview', group: 'page' as const },
    { path: '/config/indexes', label: 'Indexes', group: 'config' as const },
    { path: '/config/roles', label: 'Roles', group: 'config' as const },
    { path: '/config/apps', label: 'Splunk Apps', group: 'config' as const },
    { path: '/connections', label: 'Connections', group: 'settings' as const },
  ]

  it('collapses a group of 2+ behind one tab and exposes its members as sub-tabs', () => {
    const { tabs, groups } = groupNavForTabs(items)

    // Overview stays inline; the three config types collapse into "Configurations".
    expect(tabs.map((t) => ('items' in t ? t.label : t.label))).toEqual([
      'Overview',
      'Configurations',
      'Connections',
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.label)).toEqual(['Indexes', 'Roles', 'Splunk Apps'])
  })

  it('leaves a lone group member inline — a parent tab holding one child is noise', () => {
    const { tabs, groups } = groupNavForTabs([
      { path: '/overview', label: 'Overview', group: 'page' as const },
      { path: '/config/apps', label: 'Splunk Apps', group: 'config' as const },
    ])

    expect(tabs.map((t) => t.label)).toEqual(['Overview', 'Splunk Apps'])
    expect(groups).toHaveLength(0)
  })
})

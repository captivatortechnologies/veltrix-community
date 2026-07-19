/**
 * Tests: AppPageHost — the generic dynamic loader for marketplace app
 * client pages (/apps/:appId/*).
 */

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import AppPageHost, { type AppClientBundleModule } from '../AppPageHost'
import { AppContext } from '../../../appRuntime/installHostRuntime'
import { useApps } from '../../../contexts/AppContext'
import { usePermissionStore, type PermissionSnapshot } from '../../../stores/permissionStore'
import { fetchMyPermissions } from '../../../services/permissionService'
import type { EnabledApp } from '../../../services/appService'

vi.mock('../../../services/permissionService', () => ({
  fetchMyPermissions: vi.fn(),
}))

vi.mock('../../../contexts/AppContext', () => ({
  useApps: vi.fn(),
}))

// Keep the per-tenant upgrade banner (rendered by AppPageHost) inert in these
// tests: getAppVersion never settles, so the banner performs no real network
// fetch and never triggers a late, un-acted state update. The banner itself is
// covered by AppUpgradeBanner.test.tsx.
vi.mock('../../../services/appService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/appService')>()
  return {
    ...actual,
    appService: {
      ...actual.appService,
      getAppVersion: vi.fn(() => new Promise(() => {})),
    },
  }
})

const mockUseApps = useApps as unknown as Mock

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const testApp: EnabledApp = {
  appId: 'test-app',
  name: 'Test App',
  version: '1.0.0',
  category: 'SIEM',
  pages: [
    { path: '/dashboard', component: 'Dashboard', label: 'Dashboard' },
    { path: '/detections', component: 'Detections', label: 'Detections' },
  ],
  configurationTypes: [],
}

const StubDashboard: React.FC = () => {
  const ctx = React.useContext(AppContext)
  return (
    <div>
      stub dashboard for {ctx?.appId} (customer {ctx?.customerId})
    </div>
  )
}

const stubBundle: AppClientBundleModule = {
  id: 'test-app',
  pages: {
    Dashboard: StubDashboard,
    Detections: () => <div>stub detections page</div>,
  },
}

function useAppsReturns(enabledApps: EnabledApp[], loading = false) {
  mockUseApps.mockReturnValue({
    enabledApps,
    loading,
    error: null,
    refreshApps: async () => {},
    getSidebarPages: () => [],
  })
}

function renderHost(
  url: string,
  loadBundle: (appId: string) => Promise<AppClientBundleModule>,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/apps" element={<div>apps management page</div>} />
          <Route path="/apps/:appId/*" element={<AppPageHost loadBundle={loadBundle} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  usePermissionStore.setState({ snapshot: null })
  vi.mocked(fetchMyPermissions).mockResolvedValue({
    permissions: [],
    wildcards: { allAll: false, resources: [] },
    isPlatformAdmin: false,
  })
  localStorage.setItem(
    'user',
    JSON.stringify({ id: 'u1', email: 'u@example.com', role: 'admin', customerId: 'cust-1' }),
  )
  // Settings fetch (and any accessor calls) resolve harmlessly.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ appId: 'test-app', settings: [] }),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPageHost', () => {
  it('shows a loading state while enabled apps are being fetched', () => {
    useAppsReturns([], true)
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    expect(screen.getByRole('status', { name: 'Loading apps…' })).toBeInTheDocument()
  })

  it('renders the app page component under the shared AppContext provider', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))

    expect(
      await screen.findByText('stub dashboard for test-app (customer cust-1)'),
    ).toBeInTheDocument()
  })

  it('redirects an empty remainder to the first declared page', async () => {
    useAppsReturns([testApp])
    // Trailing slash => wildcard matches with an empty remainder.
    renderHost('/apps/test-app/', () => Promise.resolve(stubBundle))

    expect(
      await screen.findByText('stub dashboard for test-app (customer cust-1)'),
    ).toBeInTheDocument()
  })

  it('shows a friendly panel when the app is not enabled', () => {
    useAppsReturns([])
    renderHost('/apps/unknown-app/dashboard', () => Promise.resolve(stubBundle))

    expect(screen.getByText('App not available')).toBeInTheDocument()
    // Pre-existing stale assertion fixed in passing (Wave C touches this file
    // anyway): "Manage apps" links to the Marketplace catalog (where an
    // unavailable app could actually be installed/enabled), not the
    // Installed Apps roster — matches the component's actual `to="/marketplace"`
    // and every other "browse the marketplace" CTA in the app (e.g.
    // InstalledAppsPage.tsx). Unrelated to RBAC/permissions.
    expect(screen.getByRole('link', { name: 'Manage apps' })).toHaveAttribute('href', '/marketplace')
  })

  it('lists the available pages for an unknown subpath', () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/nope', () => Promise.resolve(stubBundle))

    expect(screen.getByText('Page not found')).toBeInTheDocument()
    // Each page is linked from the "Page not found" panel AND the app
    // navbar's tabs — every occurrence must point at the same route.
    const dashboardLinks = screen.getAllByRole('link', { name: 'Dashboard' })
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(2)
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('href', '/apps/test-app/dashboard')
    }
    const detectionsLinks = screen.getAllByRole('link', { name: 'Detections' })
    for (const link of detectionsLinks) {
      expect(link).toHaveAttribute('href', '/apps/test-app/detections')
    }
  })

  it('renders sub-routes beneath a declared page via prefix matching', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/detections/rule-42', () => Promise.resolve(stubBundle))

    expect(await screen.findByText('stub detections page')).toBeInTheDocument()
  })

  it('shows a readable error panel with retry when the bundle fails to load', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () => Promise.reject(new Error('network exploded')))

    expect(await screen.findByText('Failed to load app')).toBeInTheDocument()
    expect(screen.getByText(/network exploded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('retry re-invokes the loader and renders on success', async () => {
    useAppsReturns([testApp])
    const loader = vi
      .fn<(appId: string) => Promise<AppClientBundleModule>>()
      .mockRejectedValueOnce(new Error('first try failed'))
      .mockResolvedValueOnce(stubBundle)

    renderHost('/apps/test-app/dashboard', loader)

    await screen.findByText('Failed to load app')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByText('stub dashboard for test-app (customer cust-1)'),
    ).toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('explains when the bundle does not export the declared component', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () =>
      Promise.resolve({ id: 'test-app', pages: {} }),
    )

    expect(await screen.findByText('Page unavailable')).toBeInTheDocument()
    expect(screen.getByText(/does not export a "Dashboard" component/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// App navbar + per-app branding (defined slots only)
// ---------------------------------------------------------------------------

const brandedApp: EnabledApp = {
  ...testApp,
  branding: {
    primaryColor: '#FC0000',
    accentColor: '#00AA55',
    logoUrl: '/api/apps/test-app/branding/logo',
  },
}

function getNavbar() {
  return screen.getByRole('navigation', { name: 'Test App navigation' })
}

describe('AppPageHost navbar & branding', () => {
  it('renders a navbar with the app name and its nav pages as tabs (current highlighted)', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    const nav = getNavbar()
    expect(within(nav).getByText('Test App')).toBeInTheDocument()

    const dashboardTab = within(nav).getByRole('link', { name: 'Dashboard' })
    expect(dashboardTab).toHaveAttribute('href', '/apps/test-app/dashboard')
    expect(dashboardTab).toHaveAttribute('aria-current', 'page')

    const detectionsTab = within(nav).getByRole('link', { name: 'Detections' })
    expect(detectionsTab).toHaveAttribute('href', '/apps/test-app/detections')
    expect(detectionsTab).not.toHaveAttribute('aria-current')
  })

  it('excludes nav:"hidden" pages from the tabs (still routable)', async () => {
    const appWithHidden: EnabledApp = {
      ...testApp,
      pages: [
        ...testApp.pages,
        { path: '/detail', component: 'Detections', label: 'Detail', nav: 'hidden' },
      ],
    }
    useAppsReturns([appWithHidden])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    const nav = getNavbar()
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Detail' })).not.toBeInTheDocument()
  })

  it('applies the logo image and scoped CSS variables when branding is declared', async () => {
    useAppsReturns([brandedApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    const logo = within(getNavbar()).getByRole('img', { name: 'Test App logo' })
    expect(logo).toHaveAttribute('src', '/api/apps/test-app/branding/logo')

    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--veltrix-app-primary')).toBe('#FC0000')
    expect(container.style.getPropertyValue('--veltrix-app-accent')).toBe('#00AA55')
  })

  it('accent falls back to the primary color when not declared', async () => {
    useAppsReturns([
      { ...testApp, branding: { primaryColor: '#FC0000' } },
    ])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--veltrix-app-primary')).toBe('#FC0000')
    expect(container.style.getPropertyValue('--veltrix-app-accent')).toBe('#FC0000')
  })

  it('renders no logo and neutral CSS variables when the app has no branding', async () => {
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    expect(within(getNavbar()).queryByRole('img')).not.toBeInTheDocument()

    const container = screen.getByTestId('app-page-container')
    expect(container.style.getPropertyValue('--veltrix-app-primary')).toBe('#4f46e5')
    expect(container.style.getPropertyValue('--veltrix-app-accent')).toBe('#4f46e5')
  })

  it('passes the mapped branding (resolved URLs) into the app context', async () => {
    const BrandingProbe: React.FC = () => {
      const ctx = React.useContext(AppContext)
      return <div>{`branding:${JSON.stringify(ctx?.branding)}`}</div>
    }
    useAppsReturns([brandedApp])
    renderHost('/apps/test-app/dashboard', () =>
      Promise.resolve({ id: 'test-app', pages: { Dashboard: BrandingProbe, Detections: BrandingProbe } }),
    )

    expect(
      await screen.findByText(
        'branding:{"primaryColor":"#FC0000","accentColor":"#00AA55","logo":"/api/apps/test-app/branding/logo"}',
      ),
    ).toBeInTheDocument()
  })

  it('the app context branding is null when the app declares none', async () => {
    const BrandingProbe: React.FC = () => {
      const ctx = React.useContext(AppContext)
      return <div>{`branding is ${String(ctx?.branding)}`}</div>
    }
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () =>
      Promise.resolve({ id: 'test-app', pages: { Dashboard: BrandingProbe, Detections: BrandingProbe } }),
    )

    expect(await screen.findByText('branding is null')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// requiresPermission enforcement (Wave C2, RBAC/IdP hardening 2026-07-10)
// ---------------------------------------------------------------------------

const restrictedApp: EnabledApp = {
  ...testApp,
  pages: [
    ...testApp.pages,
    {
      path: '/billing',
      component: 'Billing',
      label: 'Billing',
      nav: 'sidebar',
      requiresPermission: { resource: 'payment', action: 'read' },
    },
  ],
}

function setPermissionSnapshot(snapshot: {
  permissions: Array<{ resource: string; action: string; appId: string | null }>
  wildcards: { allAll: boolean; resources: string[] }
  isPlatformAdmin: boolean
}) {
  localStorage.setItem('token', 'tok')
  vi.mocked(fetchMyPermissions).mockResolvedValue(snapshot)
}

describe('AppPageHost requiresPermission enforcement', () => {
  it('FAILS CLOSED: shows a 403 EmptyState for a requiresPermission page when not granted', async () => {
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/billing', () => Promise.resolve(stubBundle))

    expect(
      await screen.findByText("You don't have permission to view this page"),
    ).toBeInTheDocument()
    // The bundle's own page component never renders.
    expect(screen.queryByText(/stub dashboard/)).not.toBeInTheDocument()
  })

  it('excludes a requiresPermission page from the nav tabs when not granted', async () => {
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))
    await screen.findByText('stub dashboard for test-app (customer cust-1)')

    const nav = getNavbar()
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument()
  })

  it('renders the page and shows the nav tab once the fetched snapshot grants the permission', async () => {
    setPermissionSnapshot({
      permissions: [{ resource: 'payment', action: 'read', appId: null }],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: false,
    })
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/billing', () =>
      Promise.resolve({
        id: 'test-app',
        pages: { Dashboard: stubBundle.pages.Dashboard, Billing: () => <div>stub billing page</div> },
      }),
    )

    expect(await screen.findByText('stub billing page')).toBeInTheDocument()
    const nav = getNavbar()
    expect(within(nav).getByRole('link', { name: 'Billing' })).toBeInTheDocument()
  })

  it('regression: a tenant Administrator (all:all) sees the restricted page and tab exactly as before', async () => {
    setPermissionSnapshot({
      permissions: [{ resource: 'all', action: 'all', appId: null }],
      wildcards: { allAll: true, resources: [] },
      isPlatformAdmin: false,
    })
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/billing', () =>
      Promise.resolve({
        id: 'test-app',
        pages: { Dashboard: stubBundle.pages.Dashboard, Billing: () => <div>stub billing page</div> },
      }),
    )

    expect(await screen.findByText('stub billing page')).toBeInTheDocument()
  })

  it('regression: a platform admin sees the restricted page and tab exactly as before', async () => {
    setPermissionSnapshot({
      permissions: [],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: true,
    })
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/billing', () =>
      Promise.resolve({
        id: 'test-app',
        pages: { Dashboard: stubBundle.pages.Dashboard, Billing: () => <div>stub billing page</div> },
      }),
    )

    expect(await screen.findByText('stub billing page')).toBeInTheDocument()
  })

  it('a page with no requiresPermission is unaffected and always renders', async () => {
    useAppsReturns([restrictedApp])
    renderHost('/apps/test-app/dashboard', () => Promise.resolve(stubBundle))

    expect(
      await screen.findByText('stub dashboard for test-app (customer cust-1)'),
    ).toBeInTheDocument()
  })

  it("exposes ctx.permissions.has() scoped to this app's id by default", async () => {
    setPermissionSnapshot({
      permissions: [{ resource: 'indexes', action: 'write', appId: 'test-app' }],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: false,
    })
    const PermissionsProbe: React.FC = () => {
      const ctx = React.useContext(AppContext)
      return (
        <div>
          {`own:${String(ctx?.permissions.has('indexes', 'write'))} other:${String(
            ctx?.permissions.has('indexes', 'write', { appId: 'other-app' }),
          )}`}
        </div>
      )
    }
    useAppsReturns([testApp])
    renderHost('/apps/test-app/dashboard', () =>
      Promise.resolve({ id: 'test-app', pages: { Dashboard: PermissionsProbe, Detections: PermissionsProbe } }),
    )

    expect(await screen.findByText('own:true other:false')).toBeInTheDocument()
  })
})

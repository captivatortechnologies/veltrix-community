import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InstalledAppsPage from '../InstalledAppsPage'
import { appService } from '../../../services/appService'
import type { EnabledApp } from '../../../services/appService'
import type { AppListItem } from '../../../../../shared/types/app'

// ---------------------------------------------------------------------------
// Mocks
//
// All fixtures below use FICTIONAL app names (Nimbus Ops / Glacier Vault /
// Solstice Watch), never Splunk/CrowdStrike - proving the page renders
// whatever GET /api/apps + GET /api/apps/enabled return rather than any
// hardcoded app list.
// ---------------------------------------------------------------------------

vi.mock('../../../services/appService', () => ({
  appService: {
    listApps: vi.fn(),
  },
}))

let mockEnabledApps: EnabledApp[] = []
const mockRefreshApps = vi.fn()

vi.mock('../../../contexts/AppContext', () => ({
  useApps: () => ({ enabledApps: mockEnabledApps, refreshApps: mockRefreshApps }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const nimbusOps: AppListItem = {
  id: 'row-1',
  appId: 'nimbus-ops',
  name: 'Nimbus Ops',
  version: '2.3.0',
  vendor: 'Nimbus Labs',
  description: 'Orchestrate automation workflows across environments.',
  category: 'Automation',
  icon: '🌩️',
  source: 'BUILT_IN',
  isDefault: true,
  status: 'AVAILABLE',
  installed: true,
  enabled: true,
}

const glacierVault: AppListItem = {
  id: 'row-2',
  appId: 'glacier-vault',
  name: 'Glacier Vault',
  version: '1.0.4',
  vendor: 'Glacier Systems',
  description: 'Cold storage archive management.',
  category: 'Storage',
  icon: '🧊',
  source: 'MARKETPLACE',
  isDefault: false,
  status: 'AVAILABLE',
  installed: true,
  enabled: false,
}

const solsticeWatch: AppListItem = {
  id: 'row-3',
  appId: 'solstice-watch',
  name: 'Solstice Watch',
  version: '0.9.0',
  vendor: 'Solstice Security',
  description: 'Not installed for this organization.',
  category: 'Monitoring',
  icon: '🌤️',
  source: 'MARKETPLACE',
  isDefault: false,
  status: 'AVAILABLE',
  installed: false,
  enabled: false,
}

const nimbusOpsEnabled: EnabledApp = {
  appId: 'nimbus-ops',
  name: 'Nimbus Ops',
  version: '2.3.0',
  icon: '🌩️',
  category: 'Automation',
  configurationTypes: [],
  pages: [
    { path: '/dashboard', component: 'Dashboard', label: 'Dashboard', icon: 'layout-dashboard', nav: 'sidebar', order: 1 },
    { path: '/queue', component: 'Queue', label: 'Queue', icon: 'list', nav: 'sidebar', order: 2 },
    { path: '/queue/detail', component: 'QueueDetail', label: 'Queue Detail', nav: 'tab', parent: '/queue' },
    { path: '/internal', component: 'Internal', label: 'Internal Diagnostics', nav: 'hidden' },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/apps']}>
        <InstalledAppsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstalledAppsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnabledApps = []
    localStorage.clear()
    sessionStorage.clear()
  })

  it('renders apps installed for this organization and excludes non-installed ones', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps, glacierVault, solsticeWatch])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Nimbus Ops')).toBeInTheDocument()
      expect(screen.getByText('Glacier Vault')).toBeInTheDocument()
    })
    // Solstice Watch is a marketplace-only entry, never installed for this tenant.
    expect(screen.queryByText('Solstice Watch')).not.toBeInTheDocument()
  })

  it('shows an accurate installed/enabled count in the header', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps, glacierVault, solsticeWatch])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/2 apps installed for your organization/)).toBeInTheDocument()
    })
    expect(screen.getByText(/1 enabled/)).toBeInTheDocument()
  })

  it('shows a Disabled badge and an honest hint for an installed-but-disabled app', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps, glacierVault])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Glacier Vault')).toBeInTheDocument()
    })

    expect(screen.getByText('Disabled')).toBeInTheDocument()
    // No fabricated page list for a disabled app - the platform has no
    // manifest data for it (GET /api/apps/enabled excludes disabled apps).
    expect(screen.getByText('Enable this app to see its pages.')).toBeInTheDocument()
  })

  it("shows an enabled app's quick links, honoring the nav contract (sidebar only) and order", async () => {
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    const nav = await screen.findByRole('navigation', { name: 'Nimbus Ops pages' })
    const links = within(nav).getAllByRole('link')

    // Dashboard (order 1) before Queue (order 2); tab-nav "Queue Detail" and
    // hidden-nav "Internal Diagnostics" are excluded entirely.
    expect(links.map((link) => link.textContent)).toEqual(['Dashboard', 'Queue'])
    expect(screen.queryByText('Queue Detail')).not.toBeInTheDocument()
    expect(screen.queryByText('Internal Diagnostics')).not.toBeInTheDocument()

    expect(within(nav).getByRole('link', { name: /Dashboard/ })).toHaveAttribute(
      'href',
      '/apps/nimbus-ops/dashboard',
    )
  })

  it('links each app to its detail page', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Open app/ })).toHaveAttribute('href', '/apps/nimbus-ops')
    })
  })

  it('renders an empty state pointing at the marketplace when nothing is installed', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([solsticeWatch])
    mockEnabledApps = []

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No apps installed yet')).toBeInTheDocument()
    })
    const marketplaceLinks = screen.getAllByRole('link', { name: /marketplace/i })
    expect(marketplaceLinks.some((link) => link.getAttribute('href') === '/marketplace')).toBe(true)
  })

  it('shows an error banner when the apps request fails, without crashing', async () => {
    vi.mocked(appService.listApps).mockRejectedValue(new Error('Network unreachable'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Network unreachable')).toBeInTheDocument()
    })
  })

  it('filters the list by search text', async () => {
    const user = userEvent.setup()
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps, glacierVault])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Nimbus Ops')).toBeInTheDocument()
    })

    const search = screen.getByPlaceholderText(/Search by name/)
    await user.type(search, 'glacier')

    expect(screen.queryByText('Nimbus Ops')).not.toBeInTheDocument()
    expect(screen.getByText('Glacier Vault')).toBeInTheDocument()
  })

  it('FAILS CLOSED: hides a requiresPermission quick link when the caller is not authenticated (no permission source)', async () => {
    const restrictedApp: EnabledApp = {
      ...nimbusOpsEnabled,
      pages: [
        ...nimbusOpsEnabled.pages,
        {
          path: '/billing',
          component: 'Billing',
          label: 'Billing',
          nav: 'sidebar',
          order: 3,
          requiresPermission: { resource: 'payment', action: 'read' },
        },
      ],
    }
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps])
    mockEnabledApps = [restrictedApp]

    renderPage()

    const nav = await screen.findByRole('navigation', { name: 'Nimbus Ops pages' })
    expect(within(nav).queryByRole('link', { name: 'Billing' })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('filters by enabled state', async () => {
    const user = userEvent.setup()
    vi.mocked(appService.listApps).mockResolvedValue([nimbusOps, glacierVault])
    mockEnabledApps = [nimbusOpsEnabled]

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Glacier Vault')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'disabled' }))

    expect(screen.queryByText('Nimbus Ops')).not.toBeInTheDocument()
    expect(screen.getByText('Glacier Vault')).toBeInTheDocument()
  })
})

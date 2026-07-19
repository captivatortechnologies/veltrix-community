import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AppManagementPage from '../AppManagementPage'
import { appService } from '../../../services/appService'
import { toolsApi } from '../../../features/tools-integration/api'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'
import type { AppListItem } from '../../../../../shared/types/app'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/appService', () => ({
  appService: {
    listApps: vi.fn(),
    getMarketplace: vi.fn(),
    enableApp: vi.fn(),
    disableApp: vi.fn(),
    installApp: vi.fn(),
    uninstallApp: vi.fn(),
  },
}))
vi.mock('../../../features/tools-integration/api', () => ({
  toolsApi: {
    getAllTools: vi.fn(),
    getVendors: vi.fn(),
    getCategories: vi.fn(),
  },
}))
vi.mock('../../../contexts/AppContext', () => ({
  useApps: () => ({
    refreshApps: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockApps: AppListItem[] = [
  {
    id: '1',
    appId: 'splunk-enterprise',
    name: 'Splunk Enterprise',
    version: '1.0.0',
    vendor: 'Veltrix',
    description: 'Manage Splunk Enterprise configurations',
    category: 'SIEM',
    icon: undefined,
    source: 'BUILT_IN',
    isDefault: true,
    status: 'AVAILABLE',
    installed: true,
    enabled: true,
  },
  {
    id: '2',
    appId: 'crowdstrike',
    name: 'CrowdStrike Falcon',
    version: '1.0.0',
    vendor: 'CrowdStrike',
    description: 'Manage CrowdStrike EDR configurations',
    category: 'EDR',
    icon: undefined,
    source: 'MARKETPLACE',
    isDefault: false,
    status: 'AVAILABLE',
    installed: false,
    enabled: false,
  },
]

const mockTools = [
  {
    id: 1,
    name: 'Splunk Cloud',
    description: 'Cloud-based SIEM platform',
    vendor: 'Splunk',
    category: 'SIEM',
    isActive: true,
  },
]

const installedButDisabledApp: AppListItem = {
  id: '3',
  appId: 'splunk-cloud',
  name: 'Splunk Cloud Platform',
  version: '1.0.0',
  vendor: 'Veltrix',
  description: 'Manage Splunk Cloud Platform configurations',
  category: 'SIEM',
  icon: undefined,
  source: 'BUILT_IN',
  isDefault: true,
  status: 'AVAILABLE',
  installed: true,
  enabled: false,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders the current location's search string so tests can assert on URL sync. */
const LocationSearchProbe: React.FC = () => {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

const renderComponent = (initialEntry = '/apps') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ConfirmationDialogProvider>
        <AppManagementPage />
        <LocationSearchProbe />
      </ConfirmationDialogProvider>
    </MemoryRouter>
  )

const setupDefaultMocks = () => {
  vi.mocked(appService.listApps).mockResolvedValue(mockApps)
  vi.mocked(appService.getMarketplace).mockResolvedValue([])
  vi.mocked(toolsApi.getAllTools).mockResolvedValue(mockTools)
  vi.mocked(toolsApi.getVendors).mockResolvedValue(['Veltrix', 'Splunk', 'CrowdStrike'])
  vi.mocked(toolsApi.getCategories).mockResolvedValue(['SIEM', 'EDR'])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  describe('Page structure', () => {
    it('renders the page header', async () => {
      renderComponent()
      expect(screen.getByText('Marketplace')).toBeTruthy()
    })

    it('shows stats summary', async () => {
      renderComponent()
      await waitFor(() => {
        expect(screen.getByText(/1 of 2 apps enabled/)).toBeTruthy()
        expect(screen.getByText(/1 vendor integration/)).toBeTruthy()
      })
    })

    it('renders Refresh button', () => {
      renderComponent()
      expect(screen.getByText('Refresh')).toBeTruthy()
    })
  })

  describe('Unified marketplace', () => {
    it('renders both app and tool cards after loading', async () => {
      renderComponent()
      await waitFor(() => {
        expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
        expect(screen.getByText('CrowdStrike Falcon')).toBeTruthy()
        expect(screen.getByText('Splunk Cloud')).toBeTruthy()
      })
    })

    it('does not render a duplicate card when a legacy tool mirrors an app or catalog entry', async () => {
      // The tool seed ships rows named exactly like marketplace apps ("Splunk
      // Enterprise", "CrowdStrike Falcon"); those must NOT appear twice. A tool
      // with no app/catalog equivalent ("Splunk Cloud") still shows once.
      vi.mocked(toolsApi.getAllTools).mockResolvedValue([
        { id: 10, name: 'Splunk Enterprise', description: 'legacy tool', vendor: 'Splunk Inc.', category: 'SIEM', isActive: true },
        { id: 11, name: 'CrowdStrike Falcon', description: 'legacy tool', vendor: 'CrowdStrike', category: 'EDR', isActive: true },
        { id: 12, name: 'Splunk Cloud', description: 'distinct tool', vendor: 'Splunk', category: 'SIEM', isActive: true },
      ])
      renderComponent()
      await waitFor(() => expect(screen.getByText('Splunk Enterprise')).toBeTruthy())
      // Mirrored names resolve to a single (app/catalog) card, not a second tool card.
      expect(screen.getAllByText('Splunk Enterprise')).toHaveLength(1)
      expect(screen.getAllByText('CrowdStrike Falcon')).toHaveLength(1)
      // The genuinely distinct tool is untouched.
      expect(screen.getByText('Splunk Cloud')).toBeTruthy()
    })

    it('shows enabled badge for enabled apps', async () => {
      renderComponent()
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeTruthy()
      })
    })

    it('shows Enable button on tool cards (not yet enabled)', async () => {
      renderComponent()
      await waitFor(() => {
        // Splunk Enterprise is enabled (shows Disable), CrowdStrike + Splunk Cloud are not (show Enable)
        const enableButtons = screen.getAllByText('Enable')
        expect(enableButtons.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('Default filter (regression: installed-but-disabled apps must not be hidden)', () => {
    it('defaults the status filter to "all" so a disabled app is visible without any interaction', async () => {
      renderComponent()

      // CrowdStrike Falcon is installed (returned by listApps) but not enabled. Before the
      // fix the default status filter was "enabled", which hid it until the user manually
      // clicked a filter button — that's the bug this default is fixing.
      await waitFor(() => {
        expect(screen.getByText('CrowdStrike Falcon')).toBeTruthy()
      })

      const allButton = screen.getByRole('button', { name: 'all' })
      expect(allButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Status filter <-> URL query param sync', () => {
    it('preselects the status filter from ?status= on initial load', async () => {
      renderComponent('/apps?status=enabled')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'enabled' })).toHaveAttribute('aria-pressed', 'true')
      })
      expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('preselects the Installed filter from /apps?status=installed (the sidebar link contract)', async () => {
      renderComponent('/apps?status=installed')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'installed' })).toHaveAttribute('aria-pressed', 'true')
      })
    })

    it('falls back to "all" for a missing or unrecognized status param', async () => {
      renderComponent('/apps?status=not-a-real-filter')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute('aria-pressed', 'true')
      })
    })

    it('updates the URL when the status filter changes, and clears the param back to the default', async () => {
      const user = userEvent.setup()
      renderComponent('/apps')

      await waitFor(() => {
        expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      })
      expect(screen.getByTestId('location-search')).toHaveTextContent('')

      await user.click(screen.getByRole('button', { name: 'enabled' }))
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=enabled')

      await user.click(screen.getByRole('button', { name: 'installed' }))
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=installed')

      // Clicking back to "all" removes the param rather than writing ?status=all,
      // keeping the default URL clean.
      await user.click(screen.getByRole('button', { name: 'all' }))
      expect(screen.getByTestId('location-search')).toHaveTextContent('')
    })
  })

  describe('Installed filter (regression: must include installed-but-disabled apps)', () => {
    beforeEach(() => {
      vi.mocked(appService.listApps).mockResolvedValue([...mockApps, installedButDisabledApp])
    })

    it('shows installed apps regardless of enabled state, and excludes never-installed apps', async () => {
      const user = userEvent.setup()
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Splunk Cloud Platform')).toBeTruthy()
      })

      await user.click(screen.getByRole('button', { name: 'installed' }))

      // Installed: Splunk Enterprise (installed+enabled) and Splunk Cloud Platform
      // (installed but disabled) both show up...
      expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      expect(screen.getByText('Splunk Cloud Platform')).toBeTruthy()
      // ...but CrowdStrike Falcon (never installed, marketplace-only) does not.
      expect(screen.queryByText('CrowdStrike Falcon')).toBeNull()
    })

    it('excludes installed-but-disabled apps from the Enabled filter', async () => {
      const user = userEvent.setup()
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Splunk Cloud Platform')).toBeTruthy()
      })

      await user.click(screen.getByRole('button', { name: 'enabled' }))

      expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      expect(screen.queryByText('Splunk Cloud Platform')).toBeNull()
    })

    it('shows an accurate installed-apps count in the header when the Installed filter is active', async () => {
      const user = userEvent.setup()
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Splunk Cloud Platform')).toBeTruthy()
      })

      await user.click(screen.getByRole('button', { name: 'installed' }))

      // 2 installed apps: Splunk Enterprise (enabled) + Splunk Cloud Platform (disabled).
      // CrowdStrike Falcon (not installed) and the Splunk Cloud tool are not counted.
      await waitFor(() => {
        expect(screen.getByText('2 apps installed for your organization')).toBeTruthy()
      })
    })
  })

  describe('Filtering', () => {
    it('filters by search text', async () => {
      const user = userEvent.setup()
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      })

      const searchInput = screen.getByPlaceholderText(/Search by name/)
      await user.type(searchInput, 'crowd')

      expect(screen.queryByText('Splunk Enterprise')).toBeNull()
      expect(screen.getByText('CrowdStrike Falcon')).toBeTruthy()
    })

    it('filters by enabled status', async () => {
      const user = userEvent.setup()
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      })

      await user.click(screen.getByRole('button', { name: 'enabled' }))

      expect(screen.getByText('Splunk Enterprise')).toBeTruthy()
      expect(screen.queryByText('CrowdStrike Falcon')).toBeNull()
      expect(screen.queryByText('Splunk Cloud')).toBeNull()
    })

    it('renders vendor and category dropdowns (shared Select, not native <select>)', async () => {
      renderComponent()
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Filter by vendor' })).toHaveTextContent('All Vendors')
        expect(screen.getByRole('combobox', { name: 'Filter by category' })).toHaveTextContent('All Categories')
      })
    })

    it('shows empty state when nothing matches', async () => {
      vi.mocked(appService.listApps).mockResolvedValue([])
      vi.mocked(toolsApi.getAllTools).mockResolvedValue([])
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeTruthy()
      })
    })
  })

  describe('Error handling', () => {
    it('shows error when apps fetch fails', async () => {
      vi.mocked(appService.listApps).mockRejectedValue(new Error('Server error'))
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeTruthy()
      })
    })

    it('shows error when tools fetch fails', async () => {
      vi.mocked(toolsApi.getAllTools).mockRejectedValue(new Error('Tools unavailable'))
      renderComponent()

      await waitFor(() => {
        expect(screen.getByText(/Tools unavailable/)).toBeTruthy()
      })
    })
  })
})

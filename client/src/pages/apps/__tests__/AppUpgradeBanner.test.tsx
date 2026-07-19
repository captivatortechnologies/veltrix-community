import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppUpgradeBanner } from '../AppUpgradeBanner'
import type { EnabledApp, AppVersionInfo } from '../../../services/appService'

// ---------------------------------------------------------------------------
// Mocks — hooks the banner depends on (permission, apps context, toast).
// ---------------------------------------------------------------------------

const { mockToastSuccess, mockToastError, mockRefreshApps, mockHasPermission } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockRefreshApps: vi.fn().mockResolvedValue(undefined),
  mockHasPermission: vi.fn(() => true),
}))

vi.mock('../../../components/shared/Toast', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}))
vi.mock('../../../contexts/AppContext', () => ({
  useApps: () => ({ refreshApps: mockRefreshApps }),
}))
vi.mock('../../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const app: EnabledApp = {
  appId: 'splunk-enterprise',
  name: 'Splunk Enterprise',
  version: '1.16.2',
  category: 'SIEM',
  pages: [],
  configurationTypes: [],
}

const upgradeAvailable: AppVersionInfo = {
  appId: 'splunk-enterprise',
  installedVersion: '1.0.0',
  latestVersion: '1.16.2',
  upgradeAvailable: true,
  releaseNotes: '## Splunk Enterprise v1.16.2\n\n- **Drift detection** added',
}

const upToDate: AppVersionInfo = {
  appId: 'splunk-enterprise',
  installedVersion: '1.16.2',
  latestVersion: '1.16.2',
  upgradeAvailable: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHasPermission.mockReturnValue(true)
})

describe('AppUpgradeBanner', () => {
  it('renders nothing when the tenant is already on the latest version', async () => {
    const fetchVersion = vi.fn().mockResolvedValue(upToDate)
    const { container } = render(<AppUpgradeBanner app={app} fetchVersion={fetchVersion} upgrade={vi.fn()} />)
    await waitFor(() => expect(fetchVersion).toHaveBeenCalledWith('splunk-enterprise'))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the user lacks apps:write permission', async () => {
    mockHasPermission.mockReturnValue(false)
    const fetchVersion = vi.fn().mockResolvedValue(upgradeAvailable)
    const { container } = render(<AppUpgradeBanner app={app} fetchVersion={fetchVersion} upgrade={vi.fn()} />)
    await waitFor(() => expect(fetchVersion).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the banner with installed + latest versions when an upgrade is available', async () => {
    const fetchVersion = vi.fn().mockResolvedValue(upgradeAvailable)
    render(<AppUpgradeBanner app={app} fetchVersion={fetchVersion} upgrade={vi.fn()} />)
    expect(await screen.findByText(/A new version of Splunk Enterprise is available/i)).toBeInTheDocument()
    expect(screen.getByText(/You're on v1\.0\.0/i)).toBeInTheDocument()
    expect(screen.getByText(/Latest release v1\.16\.2/i)).toBeInTheDocument()
  })

  it('opens the release-notes modal and upgrades on confirm', async () => {
    const user = userEvent.setup()
    const fetchVersion = vi.fn().mockResolvedValue(upgradeAvailable)
    const upgrade = vi.fn().mockResolvedValue({ upgraded: true, toVersion: '1.16.2' })
    render(<AppUpgradeBanner app={app} fetchVersion={fetchVersion} upgrade={upgrade} />)

    await user.click(await screen.findByRole('button', { name: /Review & upgrade/i }))

    // Modal shows the title + rendered release notes (markdown -> elements).
    expect(await screen.findByText('Upgrade Splunk Enterprise to v1.16.2')).toBeInTheDocument()
    expect(screen.getByText(/Drift detection/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Upgrade to v1\.16\.2/i }))

    await waitFor(() => expect(upgrade).toHaveBeenCalledWith('splunk-enterprise'))
    expect(mockToastSuccess).toHaveBeenCalledWith('Splunk Enterprise upgraded to v1.16.2')
    expect(mockRefreshApps).toHaveBeenCalled()
  })

  it('surfaces an error toast when the upgrade fails', async () => {
    const user = userEvent.setup()
    const fetchVersion = vi.fn().mockResolvedValue(upgradeAvailable)
    const upgrade = vi.fn().mockRejectedValue(new Error('Download failed'))
    render(<AppUpgradeBanner app={app} fetchVersion={fetchVersion} upgrade={upgrade} />)

    await user.click(await screen.findByRole('button', { name: /Review & upgrade/i }))
    await user.click(await screen.findByRole('button', { name: /Upgrade to v1\.16\.2/i }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Download failed'))
  })
})

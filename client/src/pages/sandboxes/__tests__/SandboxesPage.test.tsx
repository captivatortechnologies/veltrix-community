import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SandboxesPage from '../SandboxesPage'
import { sandboxApi, type Sandbox } from '../../../services/sandboxApi'
import { ToastProvider } from '../../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'
import { useFeatureFlags } from '../../../contexts/FeatureFlagContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/sandboxApi', () => ({
  sandboxApi: {
    list: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: vi.fn(),
}))

const mockUseFeatureFlags = vi.mocked(useFeatureFlags)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = Date.now()

const activeSandbox: Sandbox = {
  id: 'sb-1',
  customerId: 'cust-1',
  name: 'local-dev',
  appId: 'splunk-enterprise',
  status: 'ACTIVE',
  createdById: 'user-1',
  lastSyncAt: null,
  fileCount: 0,
  sizeBytes: 0,
  expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
}

const syncedSandbox: Sandbox = {
  id: 'sb-2',
  customerId: 'cust-1',
  name: 'feature-branch',
  appId: 'splunk-cloud',
  status: 'SYNCING',
  createdById: 'user-1',
  lastSyncAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  fileCount: 42,
  sizeBytes: 1536,
  expiresAt: new Date(now - 60 * 1000).toISOString(), // already expired
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmationDialogProvider>
          <SandboxesPage />
        </ConfirmationDialogProvider>
      </ToastProvider>
    </MemoryRouter>
  )

const enableSandboxFeature = () => {
  mockUseFeatureFlags.mockReturnValue({
    flags: {} as never,
    isEnabled: (path: string) => path === 'platform.sandbox',
    loading: false,
  })
}

const disableSandboxFeature = () => {
  mockUseFeatureFlags.mockReturnValue({
    flags: {} as never,
    isEnabled: () => false,
    loading: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Note: don't stub navigator.clipboard here — @testing-library/user-event's
    // `userEvent.setup()` installs its own functional clipboard stub (readable back
    // via `navigator.clipboard.readText()`) and would clobber a hand-rolled one anyway.
  })

  it('shows an honest "not enabled" state when the sandbox feature flag is off', async () => {
    disableSandboxFeature()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sandboxes are not enabled')).toBeInTheDocument()
    })
    expect(sandboxApi.list).not.toHaveBeenCalled()
  })

  it('shows the empty state with a CLI snippet when there are no sandboxes', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No sandboxes yet')).toBeInTheDocument()
    })
    expect(screen.getByText(/veltrix sandbox create/)).toBeInTheDocument()
  })

  it('renders real sandbox data: status, relative expiry, relative last sync, and file summary', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox, syncedSandbox])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    // Never-synced sandbox with 0 files gets an honest label, not "0 · 0 B"
    const row1 = screen.getByText('local-dev').closest('tr') as HTMLElement
    expect(within(row1).getByText('No files synced yet')).toBeInTheDocument()
    expect(within(row1).getByText('Never synced')).toBeInTheDocument()
    expect(within(row1).getByText(/Expires in 7 days?/)).toBeInTheDocument()
    expect(within(row1).getByText('Active')).toBeInTheDocument()

    // Synced + expired sandbox
    const row2 = screen.getByText('feature-branch').closest('tr') as HTMLElement
    expect(within(row2).getByText(/42 files · 1\.5 KB/)).toBeInTheDocument()
    expect(within(row2).getByText(/^2 hours ago$/)).toBeInTheDocument() // relative last sync
    expect(within(row2).getByText(/Expired/)).toBeInTheDocument()
    expect(within(row2).getByText('Syncing')).toBeInTheDocument()
  })

  it('links the sandbox name to its detail page (regression: row was previously not clickable)', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    const nameLink = screen.getByRole('link', { name: 'local-dev' })
    expect(nameLink).toHaveAttribute('href', '/sandboxes/sb-1')
  })

  it('exposes the absolute expiry timestamp via a title attribute for the relative label', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    const expiryEl = screen.getByText(/Expires in 7 days?/)
    expect(expiryEl).toHaveAttribute('title')
    expect(expiryEl.getAttribute('title')).not.toBe('')
  })

  it('copies the per-sandbox CLI dev command to the clipboard', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox])
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    const copyButton = screen.getByRole('button', { name: /Copy CLI dev command for sandbox local-dev/ })
    await user.click(copyButton)

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(
        'veltrix dev <your-app-dir> --sandbox local-dev'
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Dev command copied to clipboard')).toBeInTheDocument()
    })
  })

  it('deletes a sandbox after confirmation', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox])
    vi.mocked(sandboxApi.delete).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete sandbox local-dev' }))

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByText('Delete sandbox')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(sandboxApi.delete).toHaveBeenCalledWith('sb-1')
      expect(screen.queryByText('local-dev')).not.toBeInTheDocument()
    })
  })

  it('does not delete when the confirmation is cancelled', async () => {
    enableSandboxFeature()
    vi.mocked(sandboxApi.list).mockResolvedValue([activeSandbox])
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('local-dev')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete sandbox local-dev' }))
    await waitFor(() => {
      expect(screen.getByText('Delete sandbox')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(sandboxApi.delete).not.toHaveBeenCalled()
    expect(screen.getByText('local-dev')).toBeInTheDocument()
  })
})

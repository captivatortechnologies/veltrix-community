import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppsIntegrationsCard from '../AppsIntegrationsCard'
import { appService } from '../../../services/appService'
import type { AppListItem } from '../../../../../shared/types/app'

vi.mock('../../../services/appService', () => ({
  appService: { listApps: vi.fn() },
}))

const renderCard = () =>
  render(
    <MemoryRouter>
      <AppsIntegrationsCard />
    </MemoryRouter>
  )

const app = (overrides: Partial<AppListItem>): AppListItem => ({
  id: 'id-1',
  appId: 'splunk-enterprise',
  name: 'Splunk Enterprise',
  version: '1.1.0',
  vendor: 'Veltrix',
  description: 'desc',
  category: 'SIEM',
  source: 'BUILT_IN',
  isDefault: true,
  status: 'AVAILABLE',
  installed: true,
  enabled: true,
  ...overrides,
})

describe('AppsIntegrationsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an honest empty state when no apps are installed', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([])
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('No apps installed yet.')).toBeInTheDocument()
    })
  })

  it('shows an error banner when the apps fetch fails, never a fabricated number', async () => {
    vi.mocked(appService.listApps).mockRejectedValue(new Error('Network down'))
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument()
    })
    expect(screen.queryByText(/of \d+ apps? enabled/)).not.toBeInTheDocument()
  })

  it('shows a real enabled/total summary without listing individual apps', async () => {
    vi.mocked(appService.listApps).mockResolvedValue([
      app({ appId: 'splunk-enterprise', name: 'Splunk Enterprise', enabled: true }),
      app({ appId: 'splunk-cloud', name: 'Splunk Cloud Platform', enabled: false, installed: true }),
    ])
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument()
    })
    expect(screen.getByText(/of 2 apps enabled/)).toBeInTheDocument()
    // The per-app list was moved to the Apps page — the dashboard card no longer lists apps.
    expect(screen.queryByText('Splunk Enterprise')).not.toBeInTheDocument()
    expect(screen.queryByText('Splunk Cloud Platform')).not.toBeInTheDocument()
    // Links to manage them instead.
    expect(screen.getByText('Manage apps')).toBeInTheDocument()
  })
})

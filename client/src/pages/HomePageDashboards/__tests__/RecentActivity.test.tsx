import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecentActivity from '../RecentActivity'
import { versionControlApi } from '../../../components/shared/VersionControl'
import type { VersionEntry } from '../../../components/shared/VersionControl'

vi.mock('../../../components/shared/VersionControl', async () => {
  const actual = await vi.importActual<typeof import('../../../components/shared/VersionControl')>(
    '../../../components/shared/VersionControl'
  )
  return {
    ...actual,
    versionControlApi: { getHistory: vi.fn() },
  }
})

const renderWidget = () =>
  render(
    <MemoryRouter>
      <RecentActivity />
    </MemoryRouter>
  )

const entry = (overrides: Partial<VersionEntry>): VersionEntry => ({
  id: 'hist-1',
  timestamp: new Date().toISOString(),
  action: 'UPDATED',
  entityType: 'CONFIGURATION_CANVAS',
  entityId: 'canvas-1',
  entityName: 'indexes_base_settings.conf',
  deployState: 'pending_approval',
  details: { message: 'Configuration canvas updated (v5)' },
  user: { id: 'u1', email: 'dev@local.test', name: 'Dev User' },
  customerId: 'cust-1',
  ...overrides,
})

describe('RecentActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an honest empty state when there is no configuration history', async () => {
    vi.mocked(versionControlApi.getHistory).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 6,
      totalPages: 0,
    })
    renderWidget()

    await waitFor(() => {
      expect(screen.getByText('No activity yet')).toBeInTheDocument()
    })
  })

  it('shows an error message when the history fetch fails', async () => {
    vi.mocked(versionControlApi.getHistory).mockRejectedValue(new Error('Server error'))
    renderWidget()

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('renders real configuration-history entries, not invented text', async () => {
    vi.mocked(versionControlApi.getHistory).mockResolvedValue({
      data: [entry({})],
      total: 1,
      page: 1,
      limit: 6,
      totalPages: 1,
    })
    renderWidget()

    await waitFor(() => {
      expect(screen.getByText('Configuration canvas updated (v5)')).toBeInTheDocument()
    })
    expect(screen.getByText(/Updated by Dev User/)).toBeInTheDocument()
  })
})

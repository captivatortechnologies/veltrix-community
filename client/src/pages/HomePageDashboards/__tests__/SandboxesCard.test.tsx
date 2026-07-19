import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SandboxesCard from '../SandboxesCard'
import { sandboxApi, type Sandbox } from '../../../services/sandboxApi'
import { useFeatureFlags } from '../../../contexts/FeatureFlagContext'

vi.mock('../../../services/sandboxApi', () => ({
  sandboxApi: { list: vi.fn() },
}))
vi.mock('../../../contexts/FeatureFlagContext', () => ({
  useFeatureFlags: vi.fn(),
}))

const renderCard = () =>
  render(
    <MemoryRouter>
      <SandboxesCard />
    </MemoryRouter>
  )

const sandbox = (overrides: Partial<Sandbox>): Sandbox => ({
  id: 'sb-1',
  customerId: 'cust-1',
  name: 'local-dev',
  appId: 'splunk-enterprise',
  status: 'ACTIVE',
  createdById: 'user-1',
  lastSyncAt: null,
  fileCount: 0,
  sizeBytes: 0,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

describe('SandboxesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an honest "not enabled" message when the feature flag is off, without calling the API', async () => {
    vi.mocked(useFeatureFlags).mockReturnValue({
      flags: {} as never,
      isEnabled: () => false,
      loading: false,
    })
    renderCard()

    await waitFor(() => {
      expect(
        screen.getByText('Developer sandboxes are not enabled for this workspace yet.')
      ).toBeInTheDocument()
    })
    expect(sandboxApi.list).not.toHaveBeenCalled()
  })

  it('shows an honest empty state when no sandboxes exist', async () => {
    vi.mocked(useFeatureFlags).mockReturnValue({
      flags: {} as never,
      isEnabled: () => true,
      loading: false,
    })
    vi.mocked(sandboxApi.list).mockResolvedValue([])
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('No sandboxes yet.')).toBeInTheDocument()
    })
  })

  it('renders the real sandbox count and status breakdown', async () => {
    vi.mocked(useFeatureFlags).mockReturnValue({
      flags: {} as never,
      isEnabled: () => true,
      loading: false,
    })
    vi.mocked(sandboxApi.list).mockResolvedValue([
      sandbox({ id: 'sb-1', status: 'ACTIVE' }),
      sandbox({ id: 'sb-2', status: 'ERROR' }),
    ])
    renderCard()

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument()
    })
    expect(screen.getByText('sandboxes')).toBeInTheDocument()
    expect(screen.getByText(/1 Active/)).toBeInTheDocument()
    expect(screen.getByText(/1 Error/)).toBeInTheDocument()
  })
})

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomePage from '../HomePage'
import { pipelineApi } from '../../components/shared/Pipeline'

// Isolate HomePage's own orchestration logic from its child widgets, which have their
// own dedicated test suites in HomePageDashboards/__tests__.
vi.mock('../HomePageDashboards/AppsIntegrationsCard', () => ({
  default: () => <div data-testid="apps-card" />,
}))
vi.mock('../HomePageDashboards/SandboxesCard', () => ({
  default: () => <div data-testid="sandboxes-card" />,
}))
vi.mock('../HomePageDashboards/RecentActivity', () => ({
  default: () => <div data-testid="recent-activity" />,
}))

vi.mock('../../components/shared/Pipeline', async () => {
  const actual = await vi.importActual<typeof import('../../components/shared/Pipeline')>(
    '../../components/shared/Pipeline'
  )
  return {
    ...actual,
    pipelineApi: { getSummary: vi.fn() },
  }
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  )

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders real pipeline summary counts, not hardcoded demo numbers', async () => {
    vi.mocked(pipelineApi.getSummary).mockResolvedValue({
      pendingValidations: 0,
      pendingApprovals: 4,
      activeDeployments: 0,
      failedDeployments: 0,
      unresolvedDrifts: 0,
    })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pending Approvals')).toBeInTheDocument()
    })
    expect(screen.getByText('4')).toBeInTheDocument()
    // The old hardcoded score/integration numbers must be gone for good.
    expect(screen.queryByText('87')).not.toBeInTheDocument()
    expect(screen.queryByText(/14 total integrations/)).not.toBeInTheDocument()
    expect(screen.queryByText(/125/)).not.toBeInTheDocument()
  })

  it('shows an error banner instead of stale/fake data when the summary fetch fails', async () => {
    vi.mocked(pipelineApi.getSummary).mockRejectedValue(new Error('Pipeline unavailable'))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Pipeline unavailable')).toBeInTheDocument()
    })
  })

  it('only links Quick Links to real, routable pages', () => {
    vi.mocked(pipelineApi.getSummary).mockResolvedValue({
      pendingValidations: 0,
      pendingApprovals: 0,
      activeDeployments: 0,
      failedDeployments: 0,
      unresolvedDrifts: 0,
    })
    renderPage()

    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    // /automation and /logs don't exist as routes; neither should appear anywhere on the page.
    expect(links).not.toContain('/automation')
    expect(links).not.toContain('/logs')
    expect(links).toContain('/apps')
    expect(links).toContain('/pipeline')
    expect(links).toContain('/access-control')
  })

  it('renders the real dashboard widgets', () => {
    vi.mocked(pipelineApi.getSummary).mockResolvedValue({
      pendingValidations: 0,
      pendingApprovals: 0,
      activeDeployments: 0,
      failedDeployments: 0,
      unresolvedDrifts: 0,
    })
    renderPage()

    expect(screen.getByTestId('apps-card')).toBeInTheDocument()
    expect(screen.getByTestId('sandboxes-card')).toBeInTheDocument()
    expect(screen.getByTestId('recent-activity')).toBeInTheDocument()
  })
})

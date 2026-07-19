import React from 'react'
import { vi, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import DriftOverview from '../DriftOverview'
import { pipelineApi } from '../../../components/shared/Pipeline'
import type { PaginatedResponse, DriftRecord } from '../../../components/shared/Pipeline'

vi.mock('../../../components/shared/Pipeline', async () => {
  const actual = await vi.importActual<typeof import('../../../components/shared/Pipeline')>(
    '../../../components/shared/Pipeline'
  )
  return {
    ...actual,
    pipelineApi: {
      ...actual.pipelineApi,
      getDriftRecords: vi.fn(),
      resolveDrift: vi.fn(),
    },
  }
})

const mockDriftData: PaginatedResponse<DriftRecord> = {
  data: [
    {
      id: 'drift-1',
      appId: 'splunk-enterprise',
      configTypeId: 'indexes',
      severity: 'critical',
      diffs: [
        { field: 'maxDataSizeMB', expected: 500, actual: 250, severity: 'critical' },
      ],
      isResolved: false,
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedAction: null,
      environment: { id: 'env-1', name: 'prod' },
      component: { id: 'comp-1', hostname: 'idx-01.example.com' },
    },
    {
      id: 'drift-2',
      appId: 'crowdstrike',
      configTypeId: 'policies',
      severity: 'warning',
      diffs: [
        { field: 'scanInterval', expected: 60, actual: 120, severity: 'warning' },
      ],
      isResolved: false,
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedAction: null,
      environment: { id: 'env-2', name: 'staging' },
      component: { id: 'comp-2', hostname: 'sensor-02.example.com' },
    },
  ],
  pagination: {
    page: 1,
    limit: 15,
    total: 2,
    totalPages: 1,
  },
}

const renderComponent = () =>
  render(
    <MemoryRouter initialEntries={['/pipeline/drift']}>
      <DriftOverview />
    </MemoryRouter>
  )

describe('DriftOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    ;(pipelineApi.getDriftRecords as Mock).mockReturnValue(new Promise(() => {}))
    renderComponent()
    expect(document.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders drift records', async () => {
    ;(pipelineApi.getDriftRecords as Mock).mockResolvedValue(mockDriftData)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('2 records')).toBeTruthy()
    })
  })

  it('renders severity summary cards', async () => {
    ;(pipelineApi.getDriftRecords as Mock).mockResolvedValue(mockDriftData)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('critical')).toBeTruthy()
      expect(screen.getByText('warning')).toBeTruthy()
      expect(screen.getByText('info')).toBeTruthy()
    })
  })

  it('renders empty state when no drift', async () => {
    ;(pipelineApi.getDriftRecords as Mock).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 15, total: 0, totalPages: 0 },
    })
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No unresolved drift detected')).toBeTruthy()
    })
  })

  it('renders error state', async () => {
    ;(pipelineApi.getDriftRecords as Mock).mockRejectedValue(
      new Error('API failure')
    )
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('API failure')).toBeTruthy()
    })
  })

  it('switches filter tabs', async () => {
    ;(pipelineApi.getDriftRecords as Mock).mockResolvedValue(mockDriftData)
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('2 records')).toBeTruthy()
    })

    const resolvedBtn = screen.getByText('resolved')
    await user.click(resolvedBtn)

    // Should have called the API again with resolved filter
    expect(pipelineApi.getDriftRecords).toHaveBeenCalledWith(
      expect.objectContaining({ isResolved: true })
    )
  })
})

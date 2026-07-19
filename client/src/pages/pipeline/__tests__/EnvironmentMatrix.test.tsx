import React from 'react'
import { vi, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import EnvironmentMatrix from '../EnvironmentMatrix'
import { pipelineApi } from '../../../components/shared/Pipeline'
import type { EnvironmentMatrixResponse } from '../../../components/shared/Pipeline'

vi.mock('../../../components/shared/Pipeline', async () => {
  const actual = await vi.importActual<typeof import('../../../components/shared/Pipeline')>(
    '../../../components/shared/Pipeline'
  )
  return {
    ...actual,
    pipelineApi: {
      ...actual.pipelineApi,
      getEnvironmentMatrix: vi.fn(),
    },
  }
})

const mockData: EnvironmentMatrixResponse = {
  environments: [
    { id: 'env-1', name: 'dev' },
    { id: 'env-2', name: 'staging' },
    { id: 'env-3', name: 'prod' },
  ],
  matrix: [
    {
      canvas: {
        id: 'c1',
        name: 'Firewall Rules',
        toolType: 'CROWDSTRIKE',
        entityType: 'RULES',
        status: 'DEPLOYED',
        version: 3,
      },
      environments: [
        {
          environmentId: 'env-1',
          environmentName: 'dev',
          deployment: {
            id: 'd1',
            status: 'SUCCEEDED',
            strategy: 'ROLLING',
            healthScore: 98,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        },
        {
          environmentId: 'env-2',
          environmentName: 'staging',
          deployment: {
            id: 'd2',
            status: 'IN_PROGRESS',
            strategy: 'CANARY',
            healthScore: null,
            startedAt: new Date().toISOString(),
            completedAt: null,
          },
        },
        {
          environmentId: 'env-3',
          environmentName: 'prod',
          deployment: null,
        },
      ],
    },
  ],
}

const renderComponent = () =>
  render(
    <MemoryRouter initialEntries={['/pipeline/environments']}>
      <EnvironmentMatrix />
    </MemoryRouter>
  )

describe('EnvironmentMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockReturnValue(new Promise(() => {}))
    renderComponent()
    expect(document.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders the matrix table with data', async () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockResolvedValue(mockData)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Firewall Rules')).toBeTruthy()
    })

    expect(screen.getByText('dev')).toBeTruthy()
    expect(screen.getByText('staging')).toBeTruthy()
    expect(screen.getByText('prod')).toBeTruthy()
  })

  it('shows Live for SUCCEEDED deployments', async () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockResolvedValue(mockData)
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeTruthy()
    })
  })

  it('renders error state', async () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockRejectedValue(
      new Error('Network error')
    )
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })
  })

  it('filters canvases by name', async () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockResolvedValue(mockData)
    const user = userEvent.setup()
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Firewall Rules')).toBeTruthy()
    })

    const filterInput = screen.getByPlaceholderText('Filter canvases...')
    await user.type(filterInput, 'nonexistent')

    expect(screen.getByText('No canvases match your filter')).toBeTruthy()
  })

  it('renders empty state when no data', async () => {
    ;(pipelineApi.getEnvironmentMatrix as Mock).mockResolvedValue({
      environments: [],
      matrix: [],
    })
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('No deployment data yet')).toBeTruthy()
    })
  })
})

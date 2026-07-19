import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EnvironmentsPage from '../EnvironmentsPage'
import { environmentsApi, type EnvironmentRecord, type OwnerOption } from '../environmentsApi'
import { ToastProvider } from '../../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'

vi.mock('../environmentsApi', () => ({
  environmentsApi: {
    list: vi.fn(),
    listUsers: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getPolicy: vi.fn(),
    savePolicy: vi.fn(),
  },
}))

const mockedApi = environmentsApi as unknown as {
  list: ReturnType<typeof vi.fn>
  listUsers: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  savePolicy: ReturnType<typeof vi.fn>
}

function policy(overrides: Partial<EnvironmentRecord['policy']> = {}) {
  return {
    id: 'pol-1',
    tagId: 'env-prod',
    appId: null,
    requireApproval: true,
    minApprovers: 2,
    requiredApproverRoles: ['sre'],
    deploymentStrategy: 'ROLLING' as const,
    canarySteps: [10, 25, 50, 100],
    healthCheckTimeout: 300,
    autoRollbackOnError: true,
    errorRateThreshold: 5,
    requirePreviousEnv: false,
    previousEnvTagId: null,
    isDefault: false,
    ...overrides,
  }
}

const environments: EnvironmentRecord[] = [
  {
    id: 'env-prod',
    name: 'prod',
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'Ada Lovelace', email: 'ada@x.com' },
    policy: policy(),
    deploymentCount: 3,
    canvasCount: 1,
  },
  {
    id: 'env-dev',
    name: 'dev',
    ownerId: null,
    owner: null,
    policy: policy({ tagId: 'env-dev', requireApproval: false, isDefault: true }),
    deploymentCount: 0,
    canvasCount: 2,
  },
]

const owners: OwnerOption[] = [
  { id: 'user-1', name: 'Ada Lovelace', email: 'ada@x.com' },
  { id: 'user-2', name: 'Alan Turing', email: 'alan@x.com' },
]

function renderPage() {
  return render(
    <ToastProvider>
      <ConfirmationDialogProvider>
        <EnvironmentsPage />
      </ConfirmationDialogProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.list.mockResolvedValue(environments)
  mockedApi.listUsers.mockResolvedValue(owners)
})

describe('EnvironmentsPage', () => {
  it('renders the environments list from the API', async () => {
    renderPage()

    expect(await screen.findByText('prod')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
    // owner name for prod, em-dash for the unowned dev
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    // policy summaries
    expect(screen.getByText(/Approval required · 2 approvers/)).toBeInTheDocument()
    expect(screen.getByText('Auto-deploy')).toBeInTheDocument()
  })

  it('opens the create dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('prod')

    await user.click(screen.getByRole('button', { name: 'New environment' }))

    expect(await screen.findByRole('heading', { name: 'New environment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('opens the controls editor and saves the policy', async () => {
    const user = userEvent.setup()
    mockedApi.savePolicy.mockResolvedValue(policy({ minApprovers: 2 }))
    renderPage()
    await screen.findByText('prod')

    await user.click(screen.getByRole('button', { name: 'Controls for prod' }))

    expect(await screen.findByRole('heading', { name: /Controls · prod/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save controls' }))

    await waitFor(() => {
      expect(mockedApi.savePolicy).toHaveBeenCalledWith(
        'env-prod',
        expect.objectContaining({ requireApproval: true, deploymentStrategy: 'ROLLING' }),
      )
    })
  })
})

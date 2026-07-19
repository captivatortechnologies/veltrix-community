import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ConfirmationDialogProvider } from '@/components/shared/ConfirmationDialog'
import CloudAccountsPage from '../CloudAccountsPage'
import { tenantCloudAccountApi } from '@/services/cloudAccountApi'

vi.mock('@/services/cloudAccountApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/cloudAccountApi')>('@/services/cloudAccountApi')
  return {
    ...actual,
    tenantCloudAccountApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
    },
  }
})

describe('CloudAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the tenant heading and loads accounts via the tenant (BYOC) API client', async () => {
    vi.mocked(tenantCloudAccountApi.list).mockResolvedValue([])

    render(
      <ConfirmationDialogProvider>
        <CloudAccountsPage />
      </ConfirmationDialogProvider>
    )

    expect(screen.getByRole('heading', { name: 'Cloud Accounts', level: 1 })).toBeInTheDocument()

    await waitFor(() => expect(tenantCloudAccountApi.list).toHaveBeenCalledTimes(1))
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmationDialogProvider } from '@/components/shared/ConfirmationDialog'
import CloudAccountsView from '../components/CloudAccountsView'
import type { CloudAccountApiClient, CloudAccountConnection } from '@/services/cloudAccountApi'

const makeApi = (): CloudAccountApiClient => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
})

const awsAccount: CloudAccountConnection = {
  id: 'acc-aws-1',
  customerId: 'cust-1',
  scope: 'customer',
  provider: 'aws',
  name: 'Prod AWS',
  authMethod: 'assume-role',
  config: { roleArn: 'arn:aws:iam::123456789012:role/VeltrixProvisioning', externalId: 'ext-123' },
  status: 'VERIFIED',
  statusMessage: null,
  isDefault: true,
  lastTestedAt: '2026-07-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const hetznerAccount: CloudAccountConnection = {
  id: 'acc-hz-1',
  customerId: 'cust-1',
  scope: 'customer',
  provider: 'hetzner',
  name: 'Staging Hetzner',
  authMethod: 'token',
  config: { token: '••••••ab12' },
  status: 'ERROR',
  statusMessage: 'Token expired',
  isDefault: false,
  lastTestedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const renderView = (api: CloudAccountApiClient) =>
  render(
    <ConfirmationDialogProvider>
      <CloudAccountsView api={api} />
    </ConfirmationDialogProvider>
  )

describe('CloudAccountsView', () => {
  let api: CloudAccountApiClient

  beforeEach(() => {
    api = makeApi()
  })

  it('shows a loading spinner while the initial fetch is in flight', () => {
    vi.mocked(api.list).mockImplementation(() => new Promise(() => {}))
    const { container } = renderView(api)

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders all four provider cards even when no accounts are configured', async () => {
    vi.mocked(api.list).mockResolvedValue([])
    renderView(api)

    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(screen.getByTestId('cloud-provider-card-aws')).toBeInTheDocument()
    expect(screen.getByTestId('cloud-provider-card-azure')).toBeInTheDocument()
    expect(screen.getByTestId('cloud-provider-card-gcp')).toBeInTheDocument()
    expect(screen.getByTestId('cloud-provider-card-hetzner')).toBeInTheDocument()
    expect(screen.getAllByText('Not configured')).toHaveLength(4)
  })

  it('groups registered accounts under their provider card with status, auth method, and default badges', async () => {
    vi.mocked(api.list).mockResolvedValue([awsAccount, hetznerAccount])
    renderView(api)

    const awsCard = await screen.findByTestId('cloud-provider-card-aws')
    expect(within(awsCard).getByText('Prod AWS')).toBeInTheDocument();
    expect(within(awsCard).getByText('Assume Role')).toBeInTheDocument();
    expect(within(awsCard).getByText('Default')).toBeInTheDocument();
    expect(within(awsCard).getByText('Verified')).toBeInTheDocument();

    const hzCard = screen.getByTestId('cloud-provider-card-hetzner');
    expect(within(hzCard).getByText('Staging Hetzner')).toBeInTheDocument();
    expect(within(hzCard).getByText('Error')).toBeInTheDocument();
    expect(within(hzCard).getByText(/Staging Hetzner: Token expired/)).toBeInTheDocument();
  })

  it('creates a new account via the top-level "Add cloud account" flow', async () => {
    vi.mocked(api.list).mockResolvedValue([])
    vi.mocked(api.create).mockResolvedValue(awsAccount)
    const user = userEvent.setup()
    renderView(api)

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /add cloud account/i }))

    // Provider defaults to AWS with its only auth method (Assume Role) preselected.
    expect(screen.getByRole('heading', { name: /add cloud account/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText(/display name/i), 'Prod AWS')
    await user.type(screen.getByLabelText(/role arn/i), 'arn:aws:iam::123456789012:role/VeltrixProvisioning')
    await user.type(screen.getByLabelText(/external id/i), 'ext-123')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        provider: 'aws',
        authMethod: 'assume-role',
        name: 'Prod AWS',
        config: { roleArn: 'arn:aws:iam::123456789012:role/VeltrixProvisioning', externalId: 'ext-123' },
        isDefault: false,
      })
    )
    // Saving refetches the list.
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))
  })

  it('presets the provider when opened from a specific provider card\'s Configure button', async () => {
    vi.mocked(api.list).mockResolvedValue([])
    const user = userEvent.setup()
    renderView(api)

    const hzCard = await screen.findByTestId('cloud-provider-card-hetzner')
    await user.click(within(hzCard).getByRole('button', { name: /configure/i }))

    expect(screen.getByText('Hetzner Cloud')).toBeInTheDocument()
    expect(screen.getByLabelText(/api token/i)).toBeInTheDocument()
  })

  it('edit mode locks provider/auth method, leaves secret fields blank, and omits untouched secrets from the update payload', async () => {
    vi.mocked(api.list).mockResolvedValue([hetznerAccount])
    vi.mocked(api.update).mockResolvedValue(hetznerAccount)
    const user = userEvent.setup()
    renderView(api)

    const row = await screen.findByTestId(`cloud-account-row-${hetznerAccount.id}`)
    await user.click(within(row).getByTitle('Edit configuration'))

    expect(screen.getByRole('heading', { name: /edit cloud account/i })).toBeInTheDocument()
    // Provider/auth method are rendered as static text, not editable selects.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const tokenField = screen.getByLabelText(/api token/i) as HTMLInputElement
    expect(tokenField.value).toBe('')
    expect(tokenField.placeholder).toBe('Leave blank to keep existing value')

    await user.click(screen.getByRole('button', { name: /^update$/i }))

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(hetznerAccount.id, {
        name: hetznerAccount.name,
        config: {},
        isDefault: false,
      })
    )
  })

  it('deletes an account after confirmation', async () => {
    vi.mocked(api.list).mockResolvedValue([awsAccount])
    vi.mocked(api.remove).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderView(api)

    const row = await screen.findByTestId(`cloud-account-row-${awsAccount.id}`)
    await user.click(within(row).getByTitle('Remove account'))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(awsAccount.id))
  })

  it('sets an account as default via the update API', async () => {
    vi.mocked(api.list).mockResolvedValue([hetznerAccount])
    vi.mocked(api.update).mockResolvedValue({ ...hetznerAccount, isDefault: true })
    const user = userEvent.setup()
    renderView(api)

    const row = await screen.findByTestId(`cloud-account-row-${hetznerAccount.id}`)
    await user.click(within(row).getByTitle('Set as default'))

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(hetznerAccount.id, { isDefault: true }))
  })

  it('tests a connection from the account row', async () => {
    vi.mocked(api.list).mockResolvedValue([awsAccount])
    vi.mocked(api.test).mockResolvedValue({ success: true, message: 'Connected', latencyMs: 120 })
    const user = userEvent.setup()
    renderView(api)

    const row = await screen.findByTestId(`cloud-account-row-${awsAccount.id}`)
    await user.click(within(row).getByTitle('Test connection'))

    await waitFor(() => expect(api.test).toHaveBeenCalledWith(awsAccount.id))
  })

  it('surfaces a load error', async () => {
    vi.mocked(api.list).mockRejectedValue(new Error('Network unreachable'))
    renderView(api)

    expect(await screen.findByText('Network unreachable')).toBeInTheDocument()
  })
})

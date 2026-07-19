import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoleManagement from '../RoleManagement';
import { ToastProvider } from '../../../components/shared/Toast';
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog';
import {
  getRoles,
  getResources,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type CatalogResource,
} from '../../../services/roleService';

vi.mock('../../../services/roleService', () => ({
  getRoles: vi.fn(),
  getResources: vi.fn(),
  getActions: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const platformCatalog: CatalogResource[] = [
  { resource: 'role', actions: ['read', 'write'], appId: null, description: 'Roles and permission management' },
  { resource: 'tool', actions: ['read', 'write'], appId: null, description: 'Tool catalog' },
  { resource: 'subscription', actions: ['read'], appId: null, description: 'Subscription tier (read-only)' },
];

const appCatalog: CatalogResource[] = [
  {
    resource: 'indexes',
    actions: ['read', 'write'],
    appId: 'splunk-enterprise',
    appName: 'Splunk Enterprise',
    description: 'Splunk index management',
  },
  {
    resource: 'host-groups',
    actions: ['read'],
    appId: 'splunk-enterprise',
    appName: 'Splunk Enterprise',
    description: 'Host Groups configuration authoring',
  },
];

const fullCatalog = [...platformCatalog, ...appCatalog];

const administratorRole: Role = {
  id: 'role-admin',
  name: 'Administrator',
  description: 'Full access',
  customerId: 'cust-1',
  permissions: [{ id: 'p1', resource: 'all', action: 'all', roleId: 'role-admin', appId: null }],
};

const analystRole: Role = {
  id: 'role-analyst',
  name: 'Security Analyst',
  description: 'Read-only access to indexes',
  customerId: 'cust-1',
  permissions: [
    { id: 'p2', resource: 'tool', action: 'read', roleId: 'role-analyst', appId: null },
    { id: 'p3', resource: 'indexes', action: 'read', roleId: 'role-analyst', appId: 'splunk-enterprise' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmationDialogProvider>
          <RoleManagement />
        </ConfirmationDialogProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getResources).mockResolvedValue(fullCatalog);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoleManagement', () => {
  it('renders roles with a permission summary', async () => {
    vi.mocked(getRoles).mockResolvedValue([administratorRole, analystRole]);
    renderPage();

    expect(await screen.findByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Full platform access')).toBeInTheDocument();

    expect(screen.getByText('Security Analyst')).toBeInTheDocument();
    expect(screen.getByText('1 platform permission')).toBeInTheDocument();
    expect(screen.getByText('Splunk Enterprise: 1 permission')).toBeInTheDocument();
  });

  it('opens a details modal when a role card is clicked, with grouped permissions and Edit/Delete actions', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([analystRole]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'View details for role Security Analyst' }));

    const dialog = screen.getByRole('dialog', { name: 'Security Analyst' });
    expect(within(dialog).getByText('Permissions')).toBeInTheDocument();
    // Grants grouped by scope: platform bucket + one per app.
    expect(within(dialog).getByText('Platform')).toBeInTheDocument();
    expect(within(dialog).getByText('Splunk Enterprise')).toBeInTheDocument();
    expect(within(dialog).getByText('indexes')).toBeInTheDocument();
    // Actions live in the modal footer.
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('Edit in the details modal opens the role form dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([analystRole]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'View details for role Security Analyst' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Security Analyst' })).getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('dialog', { name: /Edit role/i })).toBeInTheDocument();
  });

  it('shows an empty state when there are no roles', async () => {
    vi.mocked(getRoles).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No roles found')).toBeInTheDocument();
  });

  it('shows an error banner when roles fail to load', async () => {
    vi.mocked(getRoles).mockRejectedValue(new Error('Network unreachable'));
    renderPage();

    expect(await screen.findByText('Network unreachable')).toBeInTheDocument();
  });

  it('opens the add-role dialog grouped as platform resources + one section per app', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add role' }));

    expect(screen.getByRole('dialog', { name: 'Add role' })).toBeInTheDocument();
    expect(screen.getByText('Platform resources')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument() // formatted "role" resource label
    expect(screen.getByText('Installed apps')).toBeInTheDocument();
    expect(screen.getByText('Splunk Enterprise')).toBeInTheDocument();
  });

  it('creates a role with platform + app-scoped permissions, appId persisted', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([]);
    vi.mocked(createRole).mockResolvedValue({ ...analystRole, id: 'role-new' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add role' }));
    await user.type(screen.getByLabelText('Role name'), 'Custom Role');

    // Platform grant: tool:read
    const toolRow = screen.getByText('Tool').closest('div')!.parentElement!;
    await user.click(within(toolRow).getByLabelText('Read'));

    // App-scoped grant: indexes:write inside the Splunk Enterprise section (collapsible - expand first)
    await user.click(screen.getByText('Splunk Enterprise'));
    const indexesRow = screen.getByText('Indexes').closest('div')!.parentElement!;
    await user.click(within(indexesRow).getByLabelText('Write'));

    await user.click(screen.getByRole('button', { name: 'Create role' }));

    await waitFor(() => expect(createRole).toHaveBeenCalled());
    const payload = vi.mocked(createRole).mock.calls[0][0];
    expect(payload.name).toBe('Custom Role');
    expect(payload.permissions).toEqual(
      expect.arrayContaining([
        { resource: 'tool', action: 'read', appId: null },
        { resource: 'indexes', action: 'write', appId: 'splunk-enterprise' },
      ]),
    );
  });

  it('checking "Full platform access" clears other selections and disables the rest of the matrix', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add role' }));

    const toolRow = screen.getByText('Tool').closest('div')!.parentElement!;
    await user.click(within(toolRow).getByLabelText('Read'));
    expect(within(toolRow).getByLabelText('Read')).toBeChecked();

    await user.click(screen.getByLabelText('Full platform access (all:all)'));

    expect(within(toolRow).getByLabelText('Read')).not.toBeChecked();
    expect(within(toolRow).getByLabelText('Read')).toBeDisabled();
  });

  it('opens the edit dialog pre-filled with the role\'s existing selections', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([analystRole]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit role Security Analyst' }));

    expect(screen.getByRole('dialog', { name: 'Edit role: Security Analyst' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Security Analyst')).toBeInTheDocument();
    const toolRow = screen.getByText('Tool').closest('div')!.parentElement!;
    expect(within(toolRow).getByLabelText('Read')).toBeChecked();
  });

  it('surfaces a RoleEscalationError message from the server on save', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([]);
    vi.mocked(createRole).mockRejectedValue(
      new Error('Cannot grant permission(s) you do not hold yourself: role:write'),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add role' }));
    await user.type(screen.getByLabelText('Role name'), 'Escalation Attempt');
    await user.click(screen.getByRole('button', { name: 'Create role' }));

    expect(
      await screen.findByText('Cannot grant permission(s) you do not hold yourself: role:write'),
    ).toBeInTheDocument();
    // The dialog stays open on failure so the caller can adjust and retry.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('deletes a role after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(getRoles).mockResolvedValue([analystRole]);
    vi.mocked(deleteRole).mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete role Security Analyst' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith('role-analyst'));
  });
});

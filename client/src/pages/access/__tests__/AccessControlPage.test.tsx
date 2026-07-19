import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccessControlPage from '../AccessControlPage';

// Stub the heavy tab bodies so the test focuses on tab wiring.
vi.mock('../../../features/access-control/UserManagement', () => ({ default: () => <div>USER MGMT</div> }));
vi.mock('../../../features/access-control/RoleManagement', () => ({ default: () => <div>ROLE MGMT STUB</div> }));
vi.mock('../IdentityProviderPage', () => ({ default: () => <div>IDP STUB</div> }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <AccessControlPage />
    </MemoryRouter>,
  );

describe('AccessControlPage', () => {
  beforeEach(() => vi.clearAllMocks());

  // Community Edition ships RBAC + SSO/IdP free — there is no subscription
  // tier to gate them behind (unlike the hosted commercial product, which
  // showed an upgrade prompt here for free tenants).
  it('renders Role Management with no upgrade gating', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /Role Management/i }));

    expect(await screen.findByText('ROLE MGMT STUB')).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to unlock/i)).not.toBeInTheDocument();
  });

  it('renders the Identity Provider tab with no upgrade gating', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /Identity Provider/i }));

    expect(await screen.findByText('IDP STUB')).toBeInTheDocument();
    expect(screen.queryByText(/Upgrade to unlock/i)).not.toBeInTheDocument();
  });

  it('renders User Management by default', () => {
    renderPage();

    expect(screen.getByText('USER MGMT')).toBeInTheDocument();
  });
});

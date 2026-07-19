import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdentityProviderPage from '../IdentityProviderPage';
import { googleService } from '../../../services/googleService';
import { microsoftService } from '../../../services/microsoftService';
import { oidcService } from '../../../services/oidcService';
import * as cognitoService from '../../../services/cognitoService';
import { ToastProvider } from '../../../components/shared/Toast';

const renderPage = () =>
  render(
    <ToastProvider>
      <IdentityProviderPage />
    </ToastProvider>
  );

// I4: SAML/generic-OAuth are UI stubs (no backend), the Test Connection
// button surfaces real success/failure detail, and the save path (I3) must
// include Cognito and thread isCustomerSpecific/jitMode through.

vi.mock('../../../services/googleService', () => ({
  googleService: {
    getConfig: vi.fn().mockResolvedValue({ enabled: false, clientId: '', clientSecret: '', redirectUri: '', scope: '' }),
    saveConfig: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn(),
  },
}));

vi.mock('../../../services/microsoftService', () => ({
  microsoftService: {
    getConfig: vi.fn().mockResolvedValue({ enabled: false, clientId: '', clientSecret: '', tenantId: 'common', redirectUri: '', scope: '' }),
    saveConfig: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn(),
  },
}));

vi.mock('../../../services/cognitoService', () => ({
  getCognitoConfig: vi.fn().mockResolvedValue(null),
  saveCognitoConfig: vi.fn().mockResolvedValue(true),
  testCognitoConnection: vi.fn(),
  disableCognitoForSso: vi.fn().mockResolvedValue(true),
  resetCognitoConfig: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../services/oidcService', () => ({
  oidcService: {
    getConfig: vi.fn().mockResolvedValue({ enabled: false, issuer: '', clientId: '', clientSecret: '', redirectUri: '', scope: '' }),
    saveConfig: vi.fn().mockResolvedValue({ success: true }),
    testConnection: vi.fn(),
    resetConfig: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('IdentityProviderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('token', 'test-token');
  });

  it('marks SAML (still an unimplemented stub) as "Coming soon" and does not render a Configure button for it', async () => {
    renderPage();

    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const samlCard = screen.getByText('SAML').closest('div.border') as HTMLElement;
    expect(within(samlCard).getByText('Coming soon')).toBeInTheDocument();
    expect(within(samlCard).queryByRole('button', { name: 'Configure' })).not.toBeInTheDocument();
  });

  it('still renders a fully interactive Configure button for Google/Azure/Cognito/generic OIDC', async () => {
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const googleCard = screen.getByText('Google Login').closest('div.border') as HTMLElement;
    expect(within(googleCard).getByRole('button', { name: 'Configure' })).toBeInTheDocument();

    const oidcCard = screen.getByText('OAuth 2.0 / OIDC').closest('div.border') as HTMLElement;
    expect(within(oidcCard).queryByText('Coming soon')).not.toBeInTheDocument();
    expect(within(oidcCard).getByRole('button', { name: 'Configure' })).toBeInTheDocument();
  });

  it('generic OIDC card exposes Issuer, Client ID, Client Secret, Redirect URI, and Scope fields', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const oidcCard = screen.getByText('OAuth 2.0 / OIDC').closest('div.border') as HTMLElement;
    await user.click(within(oidcCard).getByRole('button', { name: 'Configure' }));

    expect(within(oidcCard).getByPlaceholderText('Enter issuer')).toBeInTheDocument();
    expect(within(oidcCard).getByPlaceholderText('Enter clientId')).toBeInTheDocument();
    expect(within(oidcCard).getByPlaceholderText('Enter clientSecret')).toBeInTheDocument();
    expect(within(oidcCard).getByPlaceholderText('Enter redirectUri')).toBeInTheDocument();
    expect(within(oidcCard).getByPlaceholderText('Enter scope')).toBeInTheDocument();
    expect(within(oidcCard).getByText('Test connection')).toBeInTheDocument();
  });

  it('saving a configured, enabled generic OIDC provider threads issuer/isCustomerSpecific/jitMode to oidcService.saveConfig', async () => {
    vi.mocked(oidcService.getConfig).mockResolvedValue({
      enabled: true,
      issuer: 'https://issuer.example.com',
      clientId: 'oidc-client',
      clientSecret: '',
      hasClientSecret: true,
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
      isCustomerSpecific: true,
      jitMode: 'domain-match',
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(oidcService.getConfig).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(oidcService.saveConfig).toHaveBeenCalledTimes(1));
    expect(oidcService.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: 'https://issuer.example.com',
        isCustomerSpecific: true,
        jitMode: 'domain-match',
      })
    );
  });

  it('generic OIDC Test connection button surfaces a truthful success message from the server', async () => {
    vi.mocked(oidcService.testConnection).mockResolvedValue({
      success: true,
      message: 'The OIDC provider configuration looks good.',
      details: ['OIDC discovery succeeded (issuer: https://issuer.example.com).'],
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const oidcCard = screen.getByText('OAuth 2.0 / OIDC').closest('div.border') as HTMLElement;
    await user.click(within(oidcCard).getByRole('button', { name: 'Configure' }));
    await user.click(within(oidcCard).getByRole('button', { name: 'Test connection' }));

    await screen.findByText('The OIDC provider configuration looks good.');
    expect(screen.getByText(/OIDC discovery succeeded/)).toBeInTheDocument();
  });

  // URGENT security fix (2026-07-11): the server never sends a stored
  // secret's real value — only a presence flag. The settings UI must never
  // pre-fill a raw editable field from that (always-empty) value.
  it('shows "•••• configured" (not an editable field) for a Google secret that is already stored', async () => {
    vi.mocked(googleService.getConfig).mockResolvedValue({
      enabled: true,
      clientId: 'existing-client-id',
      clientSecret: '',
      hasClientSecret: true,
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const googleCard = screen.getByText('Google Login').closest('div.border') as HTMLElement;
    await user.click(within(googleCard).getByRole('button', { name: 'Configure' }));

    expect(within(googleCard).getByText('•••• configured')).toBeInTheDocument();
    expect(within(googleCard).getByRole('button', { name: 'Replace secret' })).toBeInTheDocument();
    // No password input is rendered until "Replace secret" is clicked.
    expect(within(googleCard).queryByPlaceholderText('Enter a new value to replace it')).not.toBeInTheDocument();

    await user.click(within(googleCard).getByRole('button', { name: 'Replace secret' }));

    expect(within(googleCard).queryByText('•••• configured')).not.toBeInTheDocument();
    expect(within(googleCard).getByPlaceholderText('Enter a new value to replace it')).toBeInTheDocument();
  });

  it('renders an editable, empty secret field directly when no Google secret is stored yet', async () => {
    vi.mocked(googleService.getConfig).mockResolvedValue({
      enabled: false,
      clientId: '',
      clientSecret: '',
      hasClientSecret: false,
      redirectUri: '',
      scope: '',
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const googleCard = screen.getByText('Google Login').closest('div.border') as HTMLElement;
    await user.click(within(googleCard).getByRole('button', { name: 'Configure' }));

    expect(within(googleCard).queryByText('•••• configured')).not.toBeInTheDocument();
    expect(within(googleCard).getByPlaceholderText('Enter clientSecret')).toBeInTheDocument();
  });

  it('Test connection button shows a specific success message from the server', async () => {
    vi.mocked(googleService.testConnection).mockResolvedValue({
      success: true,
      message: 'Google accepted the Client ID / Client Secret pair.',
      details: ['OIDC discovery reachable.'],
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const googleCard = screen.getByText('Google Login').closest('div.border') as HTMLElement;
    await user.click(within(googleCard).getByRole('button', { name: 'Configure' }));
    await user.click(within(googleCard).getByRole('button', { name: 'Test connection' }));

    await screen.findByText('Google accepted the Client ID / Client Secret pair.');
    expect(screen.getByText('OIDC discovery reachable.')).toBeInTheDocument();
  });

  it('Test connection button shows a specific failure message from the server', async () => {
    vi.mocked(googleService.testConnection).mockResolvedValue({
      success: false,
      message: 'Google rejected the Client ID / Client Secret pair (invalid_client). Double-check both values.',
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(googleService.getConfig).toHaveBeenCalled());

    const googleCard = screen.getByText('Google Login').closest('div.border') as HTMLElement;
    await user.click(within(googleCard).getByRole('button', { name: 'Configure' }));
    await user.click(within(googleCard).getByRole('button', { name: 'Test connection' }));

    await screen.findByText(/Google rejected the Client ID/);
  });

  it('Save Changes includes Cognito (previously never saved) and threads isCustomerSpecific/jitMode for every real provider', async () => {
    vi.mocked(cognitoService.getCognitoConfig).mockResolvedValue({
      enabled: true,
      userPoolId: 'us-east-1_Test',
      userPoolRegion: 'us-east-1',
      clientId: 'cognito-client',
      clientSecret: 'secret',
      domain: 'myapp.auth.us-east-1.amazoncognito.com',
      redirectUri: 'https://app.example.com/auth/cognito/callback',
      logoutUri: 'https://app.example.com',
      scope: 'phone openid email',
      isCustomerSpecific: false,
      jitMode: 'domain-match',
    });

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(cognitoService.getCognitoConfig).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(cognitoService.saveCognitoConfig).toHaveBeenCalledTimes(1));
    expect(cognitoService.saveCognitoConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        userPoolId: 'us-east-1_Test',
        isCustomerSpecific: false,
        jitMode: 'domain-match',
      })
    );
  });
});

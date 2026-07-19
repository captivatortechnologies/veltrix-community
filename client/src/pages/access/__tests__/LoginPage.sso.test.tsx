import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../LoginPage';
import { checkUserExists } from '../../../services/authService';
import { oidcService } from '../../../services/oidcService';

// Real product gap this covers: checkUserExists only ever resolves an
// EXISTING User row, so a redirect step reachable only after it can never
// be reached by a first-time JIT-provisioned SSO user (they have no row
// yet, by definition). The generic OIDC "Continue with SSO" button must
// therefore render unconditionally on the EMAIL step whenever OIDC is
// enabled — not gated behind checkUserExists succeeding first.

vi.mock('../../../services/authService', () => ({
  login: vi.fn(),
  checkUserExists: vi.fn(),
  setAuthData: vi.fn(),
  setRememberMePreference: vi.fn(),
}));

vi.mock('../../../services/cognitoService', () => ({
  getCognitoConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../services/oidcService', () => ({
  oidcService: { getConfig: vi.fn(), initiateLogin: vi.fn() },
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );

describe('LoginPage — generic OIDC "Continue with SSO"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render the SSO button when OIDC is disabled/unconfigured', async () => {
    vi.mocked(oidcService.getConfig).mockResolvedValue({
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      scope: '',
    });

    renderPage();

    await waitFor(() => expect(oidcService.getConfig).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /continue with sso/i })).not.toBeInTheDocument();
  });

  it('renders the SSO button on the EMAIL step (before checkUserExists ever runs) when OIDC is enabled', async () => {
    vi.mocked(oidcService.getConfig).mockResolvedValue({
      enabled: true,
      issuer: 'https://issuer.example.com',
      clientId: 'client-1',
      clientSecret: '',
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
    });

    renderPage();

    await screen.findByRole('button', { name: /continue with sso/i });
    expect(checkUserExists).not.toHaveBeenCalled();
  });

  it('a brand-new (never-before-seen) email can still click "Continue with SSO" directly, forwarding it as an emailHint', async () => {
    vi.mocked(oidcService.getConfig).mockResolvedValue({
      enabled: true,
      issuer: 'https://issuer.example.com',
      clientId: 'client-1',
      clientSecret: '',
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
    });
    vi.mocked(oidcService.initiateLogin).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /continue with sso/i });

    // checkUserExists would report exists:false for this email (it has never
    // logged in before) — the SSO button must not depend on that check.
    vi.mocked(checkUserExists).mockResolvedValue({ exists: false });

    await user.type(screen.getByLabelText('Email address'), 'brandnew@acme.com');
    await user.click(screen.getByRole('button', { name: /continue with sso/i }));

    expect(oidcService.initiateLogin).toHaveBeenCalledWith('brandnew@acme.com');
    expect(checkUserExists).not.toHaveBeenCalled();
  });

  it('the button appears once a customer-specific-only config resolves via the typed email (debounced emailHint), even though the initial (hint-less) check found nothing', async () => {
    vi.mocked(oidcService.getConfig).mockImplementation(async (emailHint?: string) => {
      if (emailHint === 'someone@acme.com') {
        return {
          enabled: true,
          issuer: 'https://tenant-issuer.example.com',
          clientId: 'tenant-client',
          clientSecret: '',
          redirectUri: 'https://app.example.com/oauth/callback',
          scope: 'openid email profile',
          isCustomerSpecific: true,
        };
      }
      // No hint (or a non-matching one) -> no platform-wide global config exists.
      return { enabled: false, issuer: '', clientId: '', clientSecret: '', redirectUri: '', scope: '' };
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(oidcService.getConfig).toHaveBeenCalledWith(undefined));
    expect(screen.queryByRole('button', { name: /continue with sso/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Email address'), 'someone@acme.com');

    await waitFor(() => expect(oidcService.getConfig).toHaveBeenCalledWith('someone@acme.com'));
    await screen.findByRole('button', { name: /continue with sso/i });
  });

  it('routes an existing OIDC user to the OIDC redirect step via the normal email-first flow, for parity with Google/Microsoft', async () => {
    vi.mocked(oidcService.getConfig).mockResolvedValue({
      enabled: true,
      issuer: 'https://issuer.example.com',
      clientId: 'client-1',
      clientSecret: '',
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
    });
    vi.mocked(checkUserExists).mockResolvedValue({ exists: true, authProvider: 'OIDC' });

    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /continue with sso/i });

    await user.type(screen.getByLabelText('Email address'), 'returning@acme.com');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText(/your account uses single sign-on/i);
  });
});

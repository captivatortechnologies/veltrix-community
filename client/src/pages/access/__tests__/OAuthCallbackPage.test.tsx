import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OAuthCallbackPage from '../OAuthCallbackPage';
import { googleService } from '../../../services/googleService';
import { microsoftService } from '../../../services/microsoftService';
import { oidcService } from '../../../services/oidcService';
import { setAuthData, getRememberMePreference } from '../../../services/authService';

vi.mock('../../../services/googleService', () => ({
  googleService: { handleCallback: vi.fn(), exchangeTokens: vi.fn() },
}));

vi.mock('../../../services/microsoftService', () => ({
  microsoftService: { handleCallback: vi.fn(), exchangeTokens: vi.fn() },
}));

vi.mock('../../../services/oidcService', () => ({
  oidcService: { handleCallback: vi.fn(), exchangeTokens: vi.fn() },
}));

vi.mock('../../../services/authService', () => ({
  setAuthData: vi.fn(),
  getRememberMePreference: vi.fn().mockReturnValue(false),
}));

function renderWithCallbackParams(params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return render(
    <MemoryRouter initialEntries={[`/oauth/callback?${search}`]}>
      <OAuthCallbackPage />
    </MemoryRouter>
  );
}

describe('OAuthCallbackPage — generic OIDC branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('completes the OIDC flow when the callback state matches oidc_oauth_state, and clears it after use', async () => {
    sessionStorage.setItem('oidc_oauth_state', 'the-oidc-state');
    vi.mocked(oidcService.handleCallback).mockResolvedValue({ idToken: 'id-tok', accessToken: 'access-tok', nonce: 'nonce-1' });
    vi.mocked(oidcService.exchangeTokens).mockResolvedValue({
      token: 'jwt',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_in: 604800,
      user: { id: 'u1', email: 'alice@acme.com', name: 'Alice', firstName: 'Alice', lastName: '', role: 'User', customerId: 'cust-1', authProvider: 'OIDC' },
    });

    renderWithCallbackParams({ code: 'auth-code', state: 'the-oidc-state' });

    await screen.findByText(/authentication successful/i);

    expect(oidcService.handleCallback).toHaveBeenCalledWith('auth-code', expect.stringContaining('/oauth/callback'), 'the-oidc-state');
    expect(oidcService.exchangeTokens).toHaveBeenCalledWith('id-tok', 'access-tok', 'nonce-1');
    expect(setAuthData).toHaveBeenCalledWith('jwt', expect.objectContaining({ authProvider: 'OIDC' }), false);
    expect(sessionStorage.getItem('oidc_oauth_state')).toBeNull();
    expect(googleService.handleCallback).not.toHaveBeenCalled();
    expect(microsoftService.handleCallback).not.toHaveBeenCalled();
  });

  it('surfaces a specific, machine-readable error (e.g. an unknown JIT domain) instead of a generic failure', async () => {
    sessionStorage.setItem('oidc_oauth_state', 'the-oidc-state');
    vi.mocked(oidcService.handleCallback).mockResolvedValue({ idToken: 'id-tok', accessToken: 'access-tok', nonce: 'nonce-1' });
    vi.mocked(oidcService.exchangeTokens).mockRejectedValue({
      response: {
        data: { code: 'jit_domain_not_allowed', error: 'No organization is configured for the domain "unknown.test".' },
      },
    });

    renderWithCallbackParams({ code: 'auth-code', state: 'the-oidc-state' });

    await screen.findByText('No organization is configured for the domain "unknown.test".');
    expect(setAuthData).not.toHaveBeenCalled();
  });

  it('rejects with a state-mismatch message when the returned state matches no known provider state', async () => {
    sessionStorage.setItem('oidc_oauth_state', 'the-real-oidc-state');

    renderWithCallbackParams({ code: 'auth-code', state: 'a-completely-different-state' });

    await screen.findByText(/state mismatch/i);
    expect(oidcService.handleCallback).not.toHaveBeenCalled();
    expect(setAuthData).not.toHaveBeenCalled();
  });

  it('surfaces an upstream provider error passed directly on the query string', async () => {
    renderWithCallbackParams({ error: 'access_denied', error_description: 'User cancelled the sign-in.' });

    await screen.findByText('User cancelled the sign-in.');
    expect(oidcService.handleCallback).not.toHaveBeenCalled();
  });
});

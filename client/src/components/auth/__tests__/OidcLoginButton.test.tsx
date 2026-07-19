import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OidcLoginButton from '../OidcLoginButton';
import { oidcService } from '../../../services/oidcService';
import { setRememberMePreference } from '../../../services/authService';

vi.mock('../../../services/oidcService', () => ({
  oidcService: { initiateLogin: vi.fn() },
}));

vi.mock('../../../services/authService', () => ({
  setRememberMePreference: vi.fn(),
}));

describe('OidcLoginButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a generic "Continue with SSO" label by default', () => {
    render(<OidcLoginButton />);
    expect(screen.getByRole('button', { name: /continue with sso/i })).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    render(<OidcLoginButton label="Continue with Acme SSO" />);
    expect(screen.getByRole('button', { name: /continue with acme sso/i })).toBeInTheDocument();
  });

  it('stores the rememberMe preference and initiates login with the email hint on click', async () => {
    const user = userEvent.setup();
    vi.mocked(oidcService.initiateLogin).mockResolvedValue(undefined);

    render(<OidcLoginButton email="alice@acme.com" rememberMe />);
    await user.click(screen.getByRole('button', { name: /continue with sso/i }));

    expect(setRememberMePreference).toHaveBeenCalledWith(true);
    expect(oidcService.initiateLogin).toHaveBeenCalledWith('alice@acme.com');
  });

  it('surfaces a specific error via onError and re-enables the button when initiation fails', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    vi.mocked(oidcService.initiateLogin).mockRejectedValue({
      response: { data: { code: 'provider_disabled', error: 'disabled' } },
    });

    render(<OidcLoginButton onError={onError} />);
    await user.click(screen.getByRole('button', { name: /continue with sso/i }));

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/not currently enabled/i));
    expect(screen.getByRole('button', { name: /continue with sso/i })).not.toBeDisabled();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../LoginPage';
import { login, checkUserExists, setAuthData } from '../../../services/authService';
import { loginWith2fa } from '../../../services/twoFactorService';

vi.mock('../../../services/authService', () => ({
  login: vi.fn(),
  checkUserExists: vi.fn(),
  setAuthData: vi.fn(),
  setRememberMePreference: vi.fn(),
}));

vi.mock('../../../services/twoFactorService', () => ({
  loginWith2fa: vi.fn(),
}));

vi.mock('../../../services/cognitoService', () => ({
  getCognitoConfig: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../services/oidcService', () => ({
  oidcService: { getConfig: vi.fn().mockResolvedValue(null) },
}));

const originalLocation = window.location;

function mockLocation() {
  const mock = { ...originalLocation, href: 'http://localhost/login', search: '', pathname: '/login' };
  Object.defineProperty(window, 'location', { configurable: true, value: mock });
  return mock as { href: string };
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );

/** Walk the email -> password steps for a LOCAL user. */
async function reachPasswordStep(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(checkUserExists).mockResolvedValue({ exists: true, authProvider: 'LOCAL' });

  await user.type(screen.getByLabelText('Email address'), 'member@tenant.test');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByLabelText('Password');
}

describe('LoginPage — TOTP 2FA step', () => {
  let location: { href: string };

  beforeEach(() => {
    vi.clearAllMocks();
    location = mockLocation();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('shows the code-entry step (and stores NO session) when login returns requires2fa', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({
      requires2fa: true,
      challengeToken: 'challenge-jwt',
    } as never);

    renderPage();
    await reachPasswordStep(user);

    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByLabelText('Verification code');
    expect(screen.getByText(/two-factor authentication is enabled/i)).toBeInTheDocument();
    expect(setAuthData).not.toHaveBeenCalled();
    expect(location.href).toBe('http://localhost/login');
  });

  it('completes the login with challengeToken + code and routes the user', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({
      requires2fa: true,
      challengeToken: 'challenge-jwt',
    } as never);
    const finalResponse = {
      token: 'access-token',
      user: {
        id: 'user-1',
        email: 'member@tenant.test',
        name: 'Member',
        role: 'Administrator',
        customerId: 'cust-1',
      },
    };
    vi.mocked(loginWith2fa).mockResolvedValue(finalResponse as never);

    renderPage();
    await reachPasswordStep(user);
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByLabelText('Verification code');

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(loginWith2fa).toHaveBeenCalledWith('challenge-jwt', '123456');
    });
    expect(setAuthData).toHaveBeenCalledWith(finalResponse.token, finalResponse.user, false);
    expect(location.href).toBe('/');
  });

  it('routes platform admins to the home page after the 2FA step (no separate portal in Community Edition)', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({
      requires2fa: true,
      challengeToken: 'challenge-jwt',
    } as never);
    vi.mocked(loginWith2fa).mockResolvedValue({
      token: 'access-token',
      user: {
        id: 'admin-1',
        email: 'admin@veltrix.local',
        name: 'Admin',
        role: 'veltrix_system_administrator',
        customerId: 'cust-0',
        isPlatformAdmin: true,
      },
    } as never);

    renderPage();
    await reachPasswordStep(user);
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByLabelText('Verification code');

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(location.href).toBe('/');
    });
  });

  it('surfaces a rejected code and stays on the 2FA step', async () => {
    const user = userEvent.setup();
    vi.mocked(login).mockResolvedValue({
      requires2fa: true,
      challengeToken: 'challenge-jwt',
    } as never);
    vi.mocked(loginWith2fa).mockRejectedValue(new Error('Invalid verification code'));

    renderPage();
    await reachPasswordStep(user);
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByLabelText('Verification code');

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
    expect(setAuthData).not.toHaveBeenCalled();
  });

  it('REGRESSION: a non-2FA user signs in directly without ever seeing the code step', async () => {
    const user = userEvent.setup();
    const response = {
      token: 'access-token',
      user: {
        id: 'user-1',
        email: 'member@tenant.test',
        name: 'Member',
        role: 'Administrator',
        customerId: 'cust-1',
      },
    };
    vi.mocked(login).mockResolvedValue(response as never);

    renderPage();
    await reachPasswordStep(user);
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(setAuthData).toHaveBeenCalledWith(response.token, response.user, false);
    });
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
    expect(loginWith2fa).not.toHaveBeenCalled();
    expect(location.href).toBe('/');
  });
});

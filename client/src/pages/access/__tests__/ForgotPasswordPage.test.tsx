import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '../ForgotPasswordPage';
import { requestPasswordReset } from '../../../services/authService';

vi.mock('../../../services/authService', () => ({
  requestPasswordReset: vi.fn(),
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the email form and a link back to sign in', () => {
    renderPage();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login');
  });

  it('submits the email and shows the generic confirmation', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue(
      'If an account exists for that email, a password reset link has been sent.',
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email address'), 'member@tenant.test');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(requestPasswordReset).toHaveBeenCalledWith('member@tenant.test');
    await screen.findByText(/a password reset link has been sent/i);
    // The form is replaced by the confirmation (no email input anymore).
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('surfaces an error when the request fails', async () => {
    vi.mocked(requestPasswordReset).mockRejectedValue(new Error('Network error. Please try again.'));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email address'), 'member@tenant.test');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/network error/i));
    // Still on the form so the user can retry.
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});

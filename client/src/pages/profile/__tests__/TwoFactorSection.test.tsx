import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TwoFactorSection } from '../TwoFactorSection';
import { ToastProvider } from '../../../components/shared/Toast';
import { setup2fa, verify2fa, disable2fa } from '../../../services/twoFactorService';

vi.mock('../../../services/twoFactorService', () => ({
  setup2fa: vi.fn(),
  verify2fa: vi.fn(),
  disable2fa: vi.fn(),
}));

const renderSection = (enabled: boolean, onStatusChange = vi.fn()) => {
  render(
    <ToastProvider>
      <TwoFactorSection enabled={enabled} onStatusChange={onStatusChange} />
    </ToastProvider>
  );
  return onStatusChange;
};

describe('TwoFactorSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers Set up when disabled and reveals the otpauth URI + secret after setup', async () => {
    vi.mocked(setup2fa).mockResolvedValue({
      secret: 'BASE32SECRET',
      otpauthUrl: 'otpauth://totp/Veltrix:user%40x.test?secret=BASE32SECRET&issuer=Veltrix',
    });
    const user = userEvent.setup();

    renderSection(false);

    await user.click(screen.getByRole('button', { name: 'Set up' }));

    await waitFor(() => {
      expect(screen.getByTestId('otpauth-uri')).toHaveTextContent('otpauth://totp/Veltrix');
    });
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('BASE32SECRET');
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  });

  it('verifies the code and reports enabled to the parent', async () => {
    vi.mocked(setup2fa).mockResolvedValue({ secret: 's', otpauthUrl: 'otpauth://totp/x' });
    vi.mocked(verify2fa).mockResolvedValue({ enabled: true, message: 'ok' });
    const user = userEvent.setup();

    const onStatusChange = renderSection(false);

    await user.click(screen.getByRole('button', { name: 'Set up' }));
    await screen.findByLabelText('Verification code');

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify & enable/i }));

    await waitFor(() => {
      expect(verify2fa).toHaveBeenCalledWith('123456');
    });
    expect(onStatusChange).toHaveBeenCalledWith(true);
  });

  it('surfaces a server rejection of the verification code without enabling', async () => {
    vi.mocked(setup2fa).mockResolvedValue({ secret: 's', otpauthUrl: 'otpauth://totp/x' });
    vi.mocked(verify2fa).mockRejectedValue(new Error('Invalid verification code'));
    const user = userEvent.setup();

    const onStatusChange = renderSection(false);

    await user.click(screen.getByRole('button', { name: 'Set up' }));
    await screen.findByLabelText('Verification code');

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: /verify & enable/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
    });
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('shows the enabled state with a code-gated disable (no bare toggle)', async () => {
    vi.mocked(disable2fa).mockResolvedValue({ enabled: false, message: 'ok' });
    const user = userEvent.setup();

    const onStatusChange = renderSection(true);

    expect(screen.getByText('Enabled')).toBeInTheDocument();
    // Disable is a form that requires a code — the button stays disabled
    // until one is entered.
    const disableButton = screen.getByRole('button', { name: /disable/i });
    expect(disableButton).toBeDisabled();

    await user.type(screen.getByLabelText('Enter a code to disable'), '654321');
    expect(disableButton).toBeEnabled();
    await user.click(disableButton);

    await waitFor(() => {
      expect(disable2fa).toHaveBeenCalledWith('654321');
    });
    expect(onStatusChange).toHaveBeenCalledWith(false);
  });

  it('keeps 2FA enabled when the disable code is rejected', async () => {
    vi.mocked(disable2fa).mockRejectedValue(new Error('Invalid verification code'));
    const user = userEvent.setup();

    const onStatusChange = renderSection(true);

    await user.type(screen.getByLabelText('Enter a code to disable'), '000000');
    await user.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
    });
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

import React, { useState } from 'react';
import { Check, Copy, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  setup2fa,
  verify2fa,
  disable2fa,
  type TwoFactorSetupResponse,
} from '../../services/twoFactorService';
import { useToast } from '../../components/shared/Toast';

interface TwoFactorSectionProps {
  /** Current 2FA state from GET /profile/settings. */
  enabled: boolean;
  /** Called after 2FA is enabled or disabled so the parent can refresh. */
  onStatusChange: (enabled: boolean) => void;
}

/**
 * TwoFactorSection
 *
 * Real TOTP 2FA management for the profile settings page:
 *  disabled -> "Set up" (shows the otpauth:// URI + secret as copyable text,
 *  then a code input to verify) -> enabled -> disable (requires a code).
 *
 * 2FA state can only be changed through the code-verified /auth/2fa/*
 * endpoints — there is intentionally no bare on/off toggle here.
 */
export const TwoFactorSection: React.FC<TwoFactorSectionProps> = ({ enabled, onStatusChange }) => {
  const toast = useToast();
  const [setupInfo, setSetupInfo] = useState<TwoFactorSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStartSetup = async () => {
    setIsBusy(true);
    try {
      const info = await setup2fa();
      setSetupInfo(info);
      setVerifyCode('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start two-factor setup');
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      await verify2fa(verifyCode.trim());
      toast.success('Two-factor authentication enabled');
      setSetupInfo(null);
      setVerifyCode('');
      onStatusChange(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to verify the code');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      await disable2fa(disableCode.trim());
      toast.success('Two-factor authentication disabled');
      setDisableCode('');
      onStatusChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable two-factor authentication');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyUri = async () => {
    if (!setupInfo) return;
    try {
      await navigator.clipboard.writeText(setupInfo.otpauthUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const codeInputClasses =
    'block w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm ' +
    'placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 ' +
    'dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="mb-6" data-testid="two-factor-section">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            Two-Factor Authentication
            {enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-green-300">
                <ShieldCheck size={12} aria-hidden="true" /> Enabled
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {enabled
              ? 'Signing in requires a code from your authenticator app.'
              : 'Add an extra layer of security with a time-based one-time code.'}
          </p>
        </div>
        {!enabled && !setupInfo && (
          <button
            type="button"
            onClick={handleStartSetup}
            disabled={isBusy}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            Set up
          </button>
        )}
      </div>

      {/* Setup in progress: otpauth URI + verification code entry */}
      {!enabled && setupInfo && (
        <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Add this to your authenticator app (paste the URI or enter the secret manually), then
            verify a generated code to finish enabling 2FA.
          </p>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                Authenticator URI
              </span>
              <button
                type="button"
                onClick={handleCopyUri}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code
              data-testid="otpauth-uri"
              className="mt-1 block break-all rounded bg-gray-100 dark:bg-gray-900 p-2 text-xs text-gray-800 dark:text-gray-200"
            >
              {setupInfo.otpauthUrl}
            </code>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Secret (manual entry): <code data-testid="totp-secret">{setupInfo.secret}</code>
            </p>
          </div>

          <form onSubmit={handleVerify} className="mt-4 flex items-end gap-3">
            <div>
              <label
                htmlFor="two-factor-verify-code"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Verification code
              </label>
              <input
                id="two-factor-verify-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className={codeInputClasses}
              />
            </div>
            <button
              type="submit"
              disabled={isBusy || verifyCode.trim().length < 6}
              className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              Verify &amp; enable
            </button>
            <button
              type="button"
              onClick={() => setSetupInfo(null)}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:underline"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Enabled: disabling requires a valid code */}
      {enabled && (
        <form onSubmit={handleDisable} className="mt-4 flex items-end gap-3">
          <div>
            <label
              htmlFor="two-factor-disable-code"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Enter a code to disable
            </label>
            <input
              id="two-factor-disable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              className={codeInputClasses}
            />
          </div>
          <button
            type="submit"
            disabled={isBusy || disableCode.trim().length < 6}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <ShieldOff size={14} aria-hidden="true" /> Disable
          </button>
        </form>
      )}
    </div>
  );
};

TwoFactorSection.displayName = 'TwoFactorSection';

export default TwoFactorSection;

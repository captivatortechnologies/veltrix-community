import React, { useState } from 'react';
import { startCognitoLogin } from '../../services/cognitoService';
import { extractSsoErrorFromAxiosError } from '../../services/identityProviderTypes';

interface CognitoLoginButtonProps {
  className?: string;
  email?: string;
  rememberMe?: boolean;
  /** Button label — e.g. "Sign up with AWS Cognito" on the signup page. */
  label?: string;
}

/**
 * Starts the AWS Cognito Hosted UI flow (used for both sign-in and sign-up).
 * The redirect + callback are handled by the shared OAuthCallbackPage; JIT
 * provisioning creates the local user on first callback.
 */
const CognitoLoginButton: React.FC<CognitoLoginButtonProps> = ({
  className = '',
  email = '',
  rememberMe = false,
  label = 'Sign in with AWS Cognito',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      // On success the browser navigates away to the Hosted UI, so keep the
      // spinner up; we only reset it if the redirect itself failed to start.
      await startCognitoLogin(email || undefined, rememberMe);
    } catch (err) {
      setError(extractSsoErrorFromAxiosError(err));
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleLogin}
        disabled={isLoading}
        className={`flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <svg
          className="w-5 h-5 mr-2"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        {isLoading ? 'Signing in…' : label}
      </button>

      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
    </div>
  );
};

export default CognitoLoginButton;

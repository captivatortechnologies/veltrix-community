import React, { useState } from 'react';
import { oidcService } from '../../services/oidcService';
import { setRememberMePreference } from '../../services/authService';
import { extractSsoErrorFromAxiosError } from '../../services/identityProviderTypes';

interface OidcLoginButtonProps {
  className?: string;
  onError?: (error: string) => void;
  rememberMe?: boolean;
  /** Email typed on the login page — resolves this tenant's own config (I3). */
  email?: string;
  /** Display label — defaults to a generic "Continue with SSO". */
  label?: string;
}

const OidcLoginButton: React.FC<OidcLoginButtonProps> = ({ className = '', onError, rememberMe = false, email, label }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      // Store rememberMe preference before the redirect away from the app.
      setRememberMePreference(rememberMe);
      await oidcService.initiateLogin(email);
    } catch (error) {
      console.error('Error initiating OIDC login:', error);
      if (onError) {
        onError(extractSsoErrorFromAxiosError(error));
      }
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={isLoading}
      className={`flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {/* Generic key/SSO glyph — no vendor branding, this is a bring-your-own-issuer provider. */}
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12.65 10a5.5 5.5 0 1 0 0 4h2.35v3h3v-3H20v-4h-7.35Zm-5.15 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
          fill="currentColor"
        />
      </svg>
      {isLoading ? 'Redirecting…' : label || 'Continue with SSO'}
    </button>
  );
};

export default OidcLoginButton;

import React, { useState } from 'react';
import { microsoftService } from '../../services/microsoftService';
import { setRememberMePreference } from '../../services/authService';
import { extractSsoErrorFromAxiosError } from '../../services/identityProviderTypes';

interface MicrosoftLoginButtonProps {
  className?: string;
  onError?: (error: string) => void;
  rememberMe?: boolean;
  /** Email typed on the login page — resolves this tenant's own config (I3). */
  email?: string;
}

const MicrosoftLoginButton: React.FC<MicrosoftLoginButtonProps> = ({ className = '', onError, rememberMe = false, email }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      // Store rememberMe preference before OAuth redirect
      setRememberMePreference(rememberMe);
      await microsoftService.initiateLogin(email);
    } catch (error) {
      console.error('Error initiating Microsoft login:', error);
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
      className={`flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-white bg-[#2F2F2F] hover:bg-[#1F1F1F] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {/* Microsoft Logo SVG */}
      <svg
        className="w-5 h-5 mr-2"
        viewBox="0 0 23 23"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H12z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H12z" />
      </svg>
      {isLoading ? 'Signing in...' : 'Sign in with Microsoft'}
    </button>
  );
};

export default MicrosoftLoginButton;

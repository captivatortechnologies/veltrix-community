/**
 * TOTP two-factor authentication API client.
 *
 * Setup/verify/disable run against the authenticated session (authAxios);
 * loginWith2fa completes the two-step login using the short-lived challenge
 * token returned by POST /auth/login, so it uses a plain (unauthenticated)
 * request like login itself.
 */
import axios from 'axios';
import { authAxios, type User } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface TwoFactorSetupResponse {
  /** Base32 TOTP secret (shown once, for manual entry). */
  secret: string;
  /** otpauth:// URI for authenticator apps (copyable text). */
  otpauthUrl: string;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  message: string;
}

export interface TwoFactorLoginResponse {
  user: User;
  token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
}

const extractError = (error: unknown, fallback: string): Error => {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return new Error(error.response.data.error);
  }
  return new Error(fallback);
};

/** Begin setup: returns the secret + otpauth URI, pending until verified. */
export const setup2fa = async (): Promise<TwoFactorSetupResponse> => {
  try {
    const response = await authAxios.post<TwoFactorSetupResponse>('/auth/2fa/setup');
    return response.data;
  } catch (error) {
    throw extractError(error, 'Failed to start two-factor setup');
  }
};

/** Verify a code against the pending secret and enable 2FA. */
export const verify2fa = async (code: string): Promise<TwoFactorStatusResponse> => {
  try {
    const response = await authAxios.post<TwoFactorStatusResponse>('/auth/2fa/verify', { code });
    return response.data;
  } catch (error) {
    throw extractError(error, 'Failed to verify the code');
  }
};

/** Disable 2FA — requires a currently valid TOTP code. */
export const disable2fa = async (code: string): Promise<TwoFactorStatusResponse> => {
  try {
    const response = await authAxios.post<TwoFactorStatusResponse>('/auth/2fa/disable', { code });
    return response.data;
  } catch (error) {
    throw extractError(error, 'Failed to disable two-factor authentication');
  }
};

/** Complete a 2FA login: challenge token + code -> full token pair. */
export const loginWith2fa = async (
  challengeToken: string,
  code: string
): Promise<TwoFactorLoginResponse> => {
  try {
    const response = await axios.post<TwoFactorLoginResponse>(`${API_URL}/auth/2fa/login`, {
      challengeToken,
      code,
    });
    return response.data;
  } catch (error) {
    throw extractError(error, 'Failed to complete two-factor login');
  }
};

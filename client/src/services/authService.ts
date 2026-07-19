import axios from 'axios';
import { createApiInstance, API_URL } from '../lib/apiClient';

// Storage keys
const REMEMBER_ME_KEY = 'veltrix_remember_me';
const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const CUSTOMER_ID_KEY = 'customerId';

/**
 * Get the appropriate storage based on rememberMe preference
 */
export const getAuthStorage = (): Storage => {
  const rememberMe = sessionStorage.getItem(REMEMBER_ME_KEY) === 'true' ||
                     localStorage.getItem(REMEMBER_ME_KEY) === 'true';
  return rememberMe ? localStorage : sessionStorage;
};

/**
 * Set authentication data in the appropriate storage
 */
export const setAuthData = (token: string, user: User, rememberMe: boolean): void => {
  // Store the rememberMe preference in both storages for persistence check
  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
    sessionStorage.removeItem(REMEMBER_ME_KEY);
  } else {
    sessionStorage.setItem(REMEMBER_ME_KEY, 'false');
    localStorage.removeItem(REMEMBER_ME_KEY);
  }

  const storage = rememberMe ? localStorage : sessionStorage;

  // Clear the other storage to avoid conflicts
  const otherStorage = rememberMe ? sessionStorage : localStorage;
  otherStorage.removeItem(TOKEN_KEY);
  otherStorage.removeItem(USER_KEY);

  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));

  // Always store customerId in localStorage for API calls
  if (user.customerId) {
    localStorage.setItem(CUSTOMER_ID_KEY, user.customerId);
  }
};

/**
 * Get auth token from either storage
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
};

/**
 * Store rememberMe preference before OAuth redirect
 */
export const setRememberMePreference = (rememberMe: boolean): void => {
  sessionStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
};

/**
 * Get rememberMe preference (used after OAuth callback)
 */
export const getRememberMePreference = (): boolean => {
  return sessionStorage.getItem(REMEMBER_ME_KEY) === 'true';
};

// Types
export interface User {
  id: string | number;
  email: string;
  name?: string; // Keeping for backward compatibility
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role: string;
  customerId: string;
  authProvider?: string; // LOCAL, COGNITO, SAML, OAUTH, etc.
  isPlatformAdmin?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface CognitoConfig {
  enabled: boolean;
  userPoolId: string;
  userPoolRegion: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  logoutUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
}

// Helper function to get customer ID from localStorage
export const getCustomerId = (): string | null => {
  try {
    // First try to get customerId directly
    const directCustomerId = localStorage.getItem('customerId');
    if (directCustomerId && directCustomerId !== 'undefined' && directCustomerId !== 'null') {
      return directCustomerId;
    }

    // If not found, try to extract from user object
    const userStr = localStorage.getItem('user');
    if (userStr && userStr !== 'undefined' && userStr !== 'null') {
      const user = JSON.parse(userStr);
      if (user && user.customerId) {
        return user.customerId;
      }
    }

    // If still not found, use default customer ID
    return "00000000-0000-0000-0000-000000000001";
  } catch (error) {
    console.error('Error getting customerId:', error);
    return "00000000-0000-0000-0000-000000000001";
  }
};

// Axios instance built on the shared transport (lib/apiClient): shared auth
// request interceptor + token-refresh-with-queueing response interceptor.
// Keeps this service's richer X-Customer-ID fallback chain (stored customerId
// -> user object -> default tenant). A 401 now goes through the unified
// refresh flow; if the refresh fails, the shared interceptor clears auth and
// redirects to /login?expired=true (previously this instance logged out
// immediately without attempting a refresh). Expired IMPERSONATION sessions
// are special-cased inside the shared interceptor: the stashed admin session
// is restored instead of logging the operator out.
export const authAxios = createApiInstance({ getCustomerId });

// Check if user exists in the database or Cognito
export const checkUserExists = async (email: string): Promise<{ exists: boolean; authProvider?: string; message?: string; details?: string }> => {
  try {
    console.log('Checking if user exists locally and in Cognito:', email);
    
    const response = await axios.post(`${API_URL}/auth/check-user`, { email });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      if (error.response.status === 404) {
        return { 
          exists: false,
          message: error.response.data.message || 'User not found' 
        };
      }

      // If we get a 500 error with details, include those details in the error
      if (error.response.status === 500 && error.response.data.details) {
        console.error(`Authentication error details for ${email}:`, error.response.data.details);
        throw new Error(`Authentication error: ${error.response.data.details || error.response.data.error || 'Failed to check user'}`);
      }

      throw new Error(error.response.data.error || 'Failed to check user');
    }
    throw new Error('Network error. Please try again.');
  }
};

// Login user
export const login = async (email: string, password: string): Promise<AuthResponse | { redirectToCognito: true }> => {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    
    // Check if this is a special response indicating the user should use Cognito
    if (response.data.token === 'REDIRECT_TO_COGNITO') {
      return { redirectToCognito: true };
    }
    
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      // Include detailed error information if available
      if (error.response.data.details) {
        console.error(`Login error details for ${email}:`, error.response.data.details);
        throw new Error(`Login error: ${error.response.data.details || error.response.data.error || 'Failed to login'}`);
      }
      
      // Fall back to regular error message
      throw new Error(error.response.data.error || error.response.data.message || 'Failed to login');
    }
    throw new Error('Network error. Please try again.');
  }
};

// Register user
export const register = async (
  name: string, 
  email: string, 
  password: string, 
  authProvider: string = 'LOCAL'
): Promise<AuthResponse> => {
  try {
    // For demo purposes, use a default customer ID
    // In a real application, this would be determined by the signup flow
    const defaultCustomerId = "00000000-0000-0000-0000-000000000001";
    
    const response = await axios.post(`${API_URL}/auth/register`, { 
      name, 
      email, 
      password,
      customerId: defaultCustomerId,
      authProvider
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.error || 'Failed to register');
    }
    throw new Error('Network error. Please try again.');
  }
};

/**
 * Request a password-reset email. The server always responds the same way
 * (whether or not the account exists), so this resolves with a generic message
 * and never reveals account existence.
 */
export const requestPasswordReset = async (email: string): Promise<string> => {
  try {
    const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
    return response.data?.message || 'If an account exists for that email, a reset link has been sent.';
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.error || 'Failed to request a password reset.');
    }
    throw new Error('Network error. Please try again.');
  }
};

/**
 * Complete a password reset using the single-use token from the emailed link.
 * Throws with the server's message when the token is invalid or expired.
 */
export const resetPassword = async (token: string, newPassword: string): Promise<string> => {
  try {
    const response = await axios.post(`${API_URL}/auth/reset-password`, { token, newPassword });
    return response.data?.message || 'Your password has been reset.';
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.error || 'Failed to reset password.');
    }
    throw new Error('Network error. Please try again.');
  }
};

// Get current user
export const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await authAxios.get(`${API_URL}/auth/me`);
    return response.data.user;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.error || 'Failed to get user');
    }
    throw new Error('Network error. Please try again.');
  }
};

// Change password
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  try {
    await authAxios.post(`${API_URL}/auth/change-password`, { currentPassword, newPassword });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.error || 'Failed to change password');
    }
    throw new Error('Network error. Please try again.');
  }
};

/**
 * Keys holding data scoped to the signed-in organization. Every one of these
 * must be cleared on logout, so a leftover value is never read by the next
 * session in this browser (`getCustomerId()` falls back to `customerId`).
 * User preferences (`theme`, `sidebar-collapsed`) are deliberately preserved.
 */
const TENANT_SCOPED_KEYS = [
  TOKEN_KEY,
  USER_KEY,
  REMEMBER_ME_KEY,
  'customerId',
  // Cached permission snapshot (see stores/permissionStore.ts /
  // hooks/usePermissions.ts) — a leftover grant set must never be readable
  // by the next session in this browser (literal key duplicated here rather
  // than imported, to avoid a service <-> store import cycle).
  'veltrix_permissions_snapshot',
] as const;

// Logout user
export const logout = (): void => {
  // Clear every tenant-scoped value from both storages
  for (const key of TENANT_SCOPED_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = getAuthToken();

  // If no token exists, user is not authenticated
  if (!token) {
    return false;
  }

  // Simple check that ensures the token exists
  return true;
};

// Get Cognito configuration
export const getCognitoConfig = async (): Promise<CognitoConfig | null> => {
  try {
    // Use authAxios to include the authentication token
    const response = await authAxios.get(`/cognito`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Cognito configuration:', error);
    return null;
  }
};

// Get user from storage
export const getUser = (): User | null => {
  // Check both storages
  const userStr = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!userStr || userStr === 'undefined' || userStr === 'null') return null;

  try {
    return JSON.parse(userStr) as User;
  } catch {
    // If parsing fails, return null
    return null;
  }
};

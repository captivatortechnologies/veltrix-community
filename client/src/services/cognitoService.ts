import { authAxios, setRememberMePreference } from './authService';
import type { JitMode, TestConnectionResult } from './identityProviderTypes';

export type { JitMode };

/** sessionStorage key holding the CSRF state minted for the in-flight login. */
export const COGNITO_STATE_KEY = 'cognito_oauth_state';

export interface CognitoUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  role: string;
  customerId: string;
  authProvider: 'COGNITO';
}

export interface CognitoConfig {
  enabled: boolean;
  userPoolId: string;
  userPoolRegion: string;
  clientId: string;
  /** URGENT security fix (2026-07-11): always '' on the wire — see hasClientSecret. */
  clientSecret?: string;
  /** Presence flag for clientSecret — the settings UI renders "•••• configured" from this, never the (always-empty) value above. */
  hasClientSecret?: boolean;
  redirectUri: string;
  logoutUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  jitMode?: JitMode;
  /** Cognito Hosted UI domain — required for sign-in to work (I3). */
  domain?: string;
  /**
   * I5: AWS credentials for Cognito *admin* API calls (create/list/delete
   * users) — NOT needed for sign-in itself. Configurable here so admin
   * operations don't require restarting the server with
   * COGNITO_AWS_ACCESS_KEY_ID/SECRET env vars set.
   */
  awsAccessKeyId?: string;
  /** URGENT security fix (2026-07-11): always '' on the wire — see hasAwsSecretAccessKey. */
  awsSecretAccessKey?: string;
  /** Presence flag for awsSecretAccessKey — same pattern as hasClientSecret. */
  hasAwsSecretAccessKey?: boolean;
}

export interface CognitoAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface CognitoCallbackTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  /** I1: bound to the state consumed at /handle-callback; forwarded to /token-exchange. */
  nonce?: string;
}

// Get Cognito configuration
export const getCognitoConfig = async (): Promise<CognitoConfig | null> => {
  try {
    const response = await authAxios.get('/cognito');

    return response.data;
  } catch (error) {
    console.error('Error fetching Cognito configuration:', error);
    return null;
  }
};

// Get the AWS Cognito Hosted UI authorization URL (server-resolved domain +
// server-side state/nonce — I1/I3 instant-on fix, replaces the client
// hardcoding its own hosted-UI domain). `emailHint` lets the server resolve
// this tenant's own config instead of always falling back to global.
export const getCognitoAuthUrl = async (emailHint?: string): Promise<CognitoAuthUrlResponse> => {
  const response = await authAxios.get('/cognito/auth-url', {
    params: emailHint ? { emailHint } : undefined
  });
  return response.data;
};

/**
 * Kick off the Cognito Hosted UI flow — used for BOTH sign-in and sign-up
 * (Cognito's Hosted UI hosts the login page with a "Sign up" tab, and JIT
 * provisioning creates the local user on the first callback). Mints the
 * authorize URL server-side (hosted-UI domain + CSRF state), stashes the state
 * for the callback to verify, records the rememberMe choice, then redirects the
 * browser. The callback is handled by OAuthCallbackPage (/oauth/callback).
 */
export const startCognitoLogin = async (emailHint?: string, rememberMe = false): Promise<void> => {
  setRememberMePreference(rememberMe);
  const { authUrl, state } = await getCognitoAuthUrl(emailHint);
  sessionStorage.setItem(COGNITO_STATE_KEY, state);
  window.location.href = authUrl;
};

// Exchange a Cognito authorization code for tokens. `state` must be the
// value returned by getCognitoAuthUrl — validated server-side (I1).
export const handleCognitoCallback = async (code: string, redirectUri: string, state: string): Promise<CognitoCallbackTokens> => {
  const response = await authAxios.post('/cognito/handle-callback', { code, redirectUri, state });
  return response.data;
};

// Get all Cognito users
export const getCognitoUsers = async (): Promise<CognitoUser[]> => {
  try {
    const response = await authAxios.get('/cognito/cognito-users');
    return response.data;
  } catch (error) {
    console.error('Error fetching Cognito users:', error);
    return [];
  }
};

// Save Cognito configuration
export const saveCognitoConfig = async (config: CognitoConfig): Promise<boolean> => {
  try {
    const response = await authAxios.post('/cognito/config', config);
    
    return response.data.success;
  } catch (error) {
    console.error('Error saving Cognito configuration:', error);
    return false;
  }
};

// Reset customer-specific Cognito configuration to use global configuration
export const resetCognitoConfig = async (): Promise<boolean> => {
  try {
    const response = await authAxios.delete('/cognito/config/reset');
    
    return response.data.success;
  } catch (error) {
    console.error('Error resetting Cognito configuration:', error);
    return false;
  }
};

// I4: test an AWS Cognito configuration (the values currently in the form)
// without requiring a real login.
export const testCognitoConnection = async (data: {
  userPoolId: string;
  userPoolRegion: string;
  clientId: string;
  clientSecret?: string;
  domain?: string;
}): Promise<TestConnectionResult> => {
  try {
    const response = await authAxios.post('/cognito/test-connection', data);
    return response.data;
  } catch (error) {
    console.error('Error testing Cognito connection:', error);
    return { success: false, message: 'Failed to reach the server to test this configuration.' };
  }
};

// Disable Cognito when another SSO option is selected
export const disableCognitoForSso = async (ssoType: string): Promise<boolean> => {
  try {
    const response = await authAxios.post('/cognito/disable-for-sso', { ssoType });
    
    return response.data.success;
  } catch (error) {
    console.error(`Error disabling Cognito for SSO type ${ssoType}:`, error);
    return false;
  }
};

// Exchange Cognito tokens for a JWT token. `nonce` is the value handed back
// by handleCognitoCallback — consumed server-side (one-time) and checked
// against the ID token's own `nonce` claim (I1).
export const exchangeCognitoTokens = async (idToken: string, accessToken: string, nonce?: string) => {
  try {
    const response = await authAxios.post('/cognito/token-exchange', {
      idToken,
      accessToken,
      nonce
    });

    return response.data;
  } catch (error) {
    console.error('Error exchanging Cognito tokens:', error);
    throw error;
  }
};

// Create a user in Cognito
// Define a type for the database user
export interface DbUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  roleId: string;
  customerId: string;
  authProvider: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CognitoCreateUserResponse {
  success: boolean;
  cognitoUserId?: string;
  error?: string;
  dbUser?: DbUser; // Database user object if created successfully
  dbSaveSuccess?: boolean; // Flag indicating if the database save was successful
}

export const createCognitoUser = async (userData: {
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email: string;
  password?: string; // Make password optional
  roleId: number | string;
}): Promise<CognitoCreateUserResponse> => {
  try {
    const response = await authAxios.post('/cognito/create-user', userData);
    
    return response.data;
  } catch (error) {
    console.error('Error creating user in Cognito:', error);
    throw error;
  }
};

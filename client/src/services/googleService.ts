import { authAxios } from './authService';
import type { JitMode, TestConnectionResult } from './identityProviderTypes';

export type { JitMode };

export interface GoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  /**
   * URGENT security fix (2026-07-11): clientSecret is always '' on the wire
   * now (the server never returns the decrypted value) — this presence flag
   * is what the settings UI uses to render "•••• configured" instead of a
   * raw value.
   */
  hasClientSecret?: boolean;
  redirectUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  jitMode?: JitMode;
}

export interface GoogleAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface GoogleTokensResponse {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  /** I1: bound to the state consumed at /handle-callback; forwarded to /token-exchange. */
  nonce?: string;
}

export interface GoogleLoginResponse {
  token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    role: string;
    customerId: string;
    authProvider: string;
  };
}

export const googleService = {
  /**
   * Get Google OAuth configuration. Admin-only + authenticated
   * (2026-07-11) — uses the shared authAxios transport (mirrors
   * cognitoService) so the Authorization/X-Customer-ID headers are always
   * attached, instead of the bare, unauthenticated axios call this used to
   * make (which always returned the GLOBAL config regardless of the
   * viewer's tenant).
   */
  async getConfig(): Promise<GoogleConfig> {
    try {
      const response = await authAxios.get('/google');
      return response.data;
    } catch (error) {
      console.error('Error getting Google config:', error);
      throw error;
    }
  },

  /**
   * Get Google OAuth authorization URL. `emailHint` (the email typed on the
   * login page, if any) lets the server resolve this tenant's own config
   * instead of always falling back to global (I3).
   */
  async getAuthUrl(emailHint?: string): Promise<GoogleAuthUrlResponse> {
    try {
      const response = await authAxios.get('/google/auth-url', {
        params: emailHint ? { emailHint } : undefined
      });
      return response.data;
    } catch (error) {
      console.error('Error getting Google auth URL:', error);
      throw error;
    }
  },

  /**
   * Handle Google OAuth callback. `state` is the value returned alongside
   * the authorization code and MUST be the one issued by getAuthUrl — the
   * server validates it server-side (I1) and returns the bound `nonce`.
   */
  async handleCallback(code: string, redirectUri: string, state: string): Promise<GoogleTokensResponse> {
    try {
      const response = await authAxios.post('/google/handle-callback', {
        code,
        redirectUri,
        state
      });
      return response.data;
    } catch (error) {
      console.error('Error handling Google callback:', error);
      throw error;
    }
  },

  /**
   * Exchange Google tokens for application JWT. `nonce` is the value handed
   * back by handleCallback — the server consumes it (one-time) and checks it
   * against the ID token's own `nonce` claim (I1).
   */
  async exchangeTokens(idToken: string, accessToken: string, nonce?: string): Promise<GoogleLoginResponse> {
    try {
      const response = await authAxios.post('/google/token-exchange', {
        idToken,
        accessToken,
        nonce
      });
      return response.data;
    } catch (error) {
      console.error('Error exchanging Google tokens:', error);
      throw error;
    }
  },

  /**
   * Save Google configuration (admin only). An empty/omitted clientSecret
   * preserves whatever the server already has stored (preserve-on-omit) —
   * see IdentityProviderPage's "Replace secret" affordance.
   */
  async saveConfig(config: GoogleConfig): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.post('/google/config', config);
      return response.data;
    } catch (error) {
      console.error('Error saving Google config:', error);
      throw error;
    }
  },

  /**
   * I4: test a Google OAuth configuration (the values currently in the
   * form, not necessarily what's saved) without requiring a real login.
   */
  async testConnection(
    data: { clientId: string; clientSecret: string; redirectUri?: string }
  ): Promise<TestConnectionResult> {
    try {
      const response = await authAxios.post('/google/test-connection', data);
      return response.data;
    } catch (error) {
      console.error('Error testing Google connection:', error);
      return { success: false, message: 'Failed to reach the server to test this configuration.' };
    }
  },

  /**
   * Reset Google configuration (admin only)
   */
  async resetConfig(): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.delete('/google/config/reset');
      return response.data;
    } catch (error) {
      console.error('Error resetting Google config:', error);
      throw error;
    }
  },

  /**
   * Initiate Google OAuth login flow. `emailHint` (I3) lets the server
   * resolve this tenant's own config for the flow.
   */
  async initiateLogin(emailHint?: string): Promise<void> {
    try {
      // Store the intended redirect URI for the callback
      const redirectUri = `${window.location.origin}/oauth/callback`;
      sessionStorage.setItem('google_redirect_uri', redirectUri);

      const { authUrl, state } = await this.getAuthUrl(emailHint);

      // Store state in sessionStorage for CSRF protection
      sessionStorage.setItem('google_oauth_state', state);

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Google login:', error);
      throw error;
    }
  }
};

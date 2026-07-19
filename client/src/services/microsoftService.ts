import { authAxios } from './authService';
import type { JitMode, TestConnectionResult } from './identityProviderTypes';

export type { JitMode };

export interface MicrosoftConfig {
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
  tenantId: string;
  redirectUri: string;
  scope: string;
  authority?: string;
  isCustomerSpecific?: boolean;
  jitMode?: JitMode;
}

export interface MicrosoftAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface MicrosoftTokensResponse {
  idToken: string;
  accessToken: string;
  /** I1: bound to the state consumed at /handle-callback; forwarded to /token-exchange. */
  nonce?: string;
}

export interface MicrosoftLoginResponse {
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

export const microsoftService = {
  /**
   * Get Microsoft OAuth configuration. Admin-only + authenticated
   * (2026-07-11) — uses the shared authAxios transport (mirrors
   * cognitoService) so the Authorization/X-Customer-ID headers are always
   * attached, instead of the bare, unauthenticated axios call this used to
   * make (which always returned the GLOBAL config regardless of the
   * viewer's tenant).
   */
  async getConfig(): Promise<MicrosoftConfig> {
    try {
      const response = await authAxios.get('/microsoft');
      return response.data;
    } catch (error) {
      console.error('Error getting Microsoft config:', error);
      throw error;
    }
  },

  /**
   * Get Microsoft OAuth authorization URL. `emailHint` (I3) lets the server
   * resolve this tenant's own config instead of always falling back to global.
   */
  async getAuthUrl(emailHint?: string): Promise<MicrosoftAuthUrlResponse> {
    try {
      const response = await authAxios.get('/microsoft/auth-url', {
        params: emailHint ? { emailHint } : undefined
      });
      return response.data;
    } catch (error) {
      console.error('Error getting Microsoft auth URL:', error);
      throw error;
    }
  },

  /**
   * Handle Microsoft OAuth callback. `state` is the value returned alongside
   * the authorization code and MUST be the one issued by getAuthUrl — the
   * server validates it server-side (I1) and returns the bound `nonce`.
   */
  async handleCallback(code: string, redirectUri: string, state: string): Promise<MicrosoftTokensResponse> {
    try {
      const response = await authAxios.post('/microsoft/handle-callback', {
        code,
        redirectUri,
        state
      });
      return response.data;
    } catch (error) {
      console.error('Error handling Microsoft callback:', error);
      throw error;
    }
  },

  /**
   * Exchange Microsoft tokens for application JWT. `nonce` is the value
   * handed back by handleCallback — the server consumes it (one-time) (I1).
   */
  async exchangeTokens(idToken: string, accessToken: string, nonce?: string): Promise<MicrosoftLoginResponse> {
    try {
      const response = await authAxios.post('/microsoft/token-exchange', {
        idToken,
        accessToken,
        nonce
      });
      return response.data;
    } catch (error) {
      console.error('Error exchanging Microsoft tokens:', error);
      throw error;
    }
  },

  /**
   * Save Microsoft configuration (admin only). An empty/omitted
   * clientSecret preserves whatever the server already has stored
   * (preserve-on-omit) — see IdentityProviderPage's "Replace secret"
   * affordance.
   */
  async saveConfig(config: MicrosoftConfig): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.post('/microsoft/config', config);
      return response.data;
    } catch (error) {
      console.error('Error saving Microsoft config:', error);
      throw error;
    }
  },

  /**
   * I4: test a Microsoft/Azure AD OAuth configuration (the values currently
   * in the form) without requiring a real login.
   */
  async testConnection(
    data: { clientId: string; clientSecret: string; tenantId?: string; redirectUri?: string }
  ): Promise<TestConnectionResult> {
    try {
      const response = await authAxios.post('/microsoft/test-connection', data);
      return response.data;
    } catch (error) {
      console.error('Error testing Microsoft connection:', error);
      return { success: false, message: 'Failed to reach the server to test this configuration.' };
    }
  },

  /**
   * Reset Microsoft configuration (admin only)
   */
  async resetConfig(): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.delete('/microsoft/config/reset');
      return response.data;
    } catch (error) {
      console.error('Error resetting Microsoft config:', error);
      throw error;
    }
  },

  /**
   * Initiate Microsoft OAuth login flow
   */
  async initiateLogin(emailHint?: string): Promise<void> {
    try {
      // Store the intended redirect URI for the callback
      const redirectUri = `${window.location.origin}/oauth/callback`;
      sessionStorage.setItem('microsoft_redirect_uri', redirectUri);

      const { authUrl, state } = await this.getAuthUrl(emailHint);

      // Store state in sessionStorage for CSRF protection
      sessionStorage.setItem('microsoft_oauth_state', state);

      // Redirect to Microsoft OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Microsoft login:', error);
      throw error;
    }
  }
};

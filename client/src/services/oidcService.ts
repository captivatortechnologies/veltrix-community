import { authAxios } from './authService';
import type { JitMode, TestConnectionResult } from './identityProviderTypes';

export type { JitMode };

export interface OidcConfig {
  enabled: boolean;
  /** OIDC issuer base URL — discovery is fetched from `{issuer}/.well-known/openid-configuration`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /**
   * The server never returns the decrypted value — this presence flag is
   * what the settings UI uses to render "•••• configured" instead of a raw
   * value.
   */
  hasClientSecret?: boolean;
  redirectUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  jitMode?: JitMode;
}

export interface OidcAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface OidcTokensResponse {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  /** Bound to the state consumed at /handle-callback; forwarded to /token-exchange. */
  nonce?: string;
}

export interface OidcLoginResponse {
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

export const oidcService = {
  /**
   * Get generic OIDC configuration. Used both by the (authenticated) admin
   * settings page and — pre-login — by LoginPage's "Continue with SSO"
   * visibility check. `emailHint` lets an anonymous caller resolve a
   * CUSTOMER-SPECIFIC config (once they've typed an email at that tenant's
   * domain) instead of only ever seeing a platform-wide global config (I3,
   * same pattern as getAuthUrl below).
   */
  async getConfig(emailHint?: string): Promise<OidcConfig> {
    try {
      const response = await authAxios.get('/oidc', { params: emailHint ? { emailHint } : undefined });
      return response.data;
    } catch (error) {
      console.error('Error getting OIDC config:', error);
      throw error;
    }
  },

  /**
   * Get the OIDC authorization URL. `emailHint` (the email typed on the
   * login page, if any) lets the server resolve this tenant's own config
   * instead of always falling back to global (I3).
   */
  async getAuthUrl(emailHint?: string): Promise<OidcAuthUrlResponse> {
    try {
      const response = await authAxios.get('/oidc/auth-url', {
        params: emailHint ? { emailHint } : undefined
      });
      return response.data;
    } catch (error) {
      console.error('Error getting OIDC auth URL:', error);
      throw error;
    }
  },

  /**
   * Handle the OIDC callback. `state` is the value returned alongside the
   * authorization code and MUST be the one issued by getAuthUrl — the
   * server validates it server-side and returns the bound `nonce`.
   */
  async handleCallback(code: string, redirectUri: string, state: string): Promise<OidcTokensResponse> {
    try {
      const response = await authAxios.post('/oidc/handle-callback', { code, redirectUri, state });
      return response.data;
    } catch (error) {
      console.error('Error handling OIDC callback:', error);
      throw error;
    }
  },

  /**
   * Exchange OIDC tokens for application JWT. `nonce` is the value handed
   * back by handleCallback — the server consumes it (one-time) and checks it
   * against the ID token's own `nonce` claim.
   */
  async exchangeTokens(idToken: string, accessToken: string, nonce?: string): Promise<OidcLoginResponse> {
    try {
      const response = await authAxios.post('/oidc/token-exchange', { idToken, accessToken, nonce });
      return response.data;
    } catch (error) {
      console.error('Error exchanging OIDC tokens:', error);
      throw error;
    }
  },

  /**
   * Save generic OIDC configuration (admin only). An empty/omitted
   * clientSecret preserves whatever the server already has stored
   * (preserve-on-omit) — see IdentityProviderPage's "Replace secret" affordance.
   */
  async saveConfig(config: OidcConfig): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.post('/oidc/config', config);
      return response.data;
    } catch (error) {
      console.error('Error saving OIDC config:', error);
      throw error;
    }
  },

  /**
   * Test a generic OIDC configuration (the values currently in the form,
   * not necessarily what's saved) without requiring a real login.
   */
  async testConnection(
    data: { issuer: string; clientId: string; clientSecret: string; redirectUri?: string }
  ): Promise<TestConnectionResult> {
    try {
      const response = await authAxios.post('/oidc/test-connection', data);
      return response.data;
    } catch (error) {
      console.error('Error testing OIDC connection:', error);
      return { success: false, message: 'Failed to reach the server to test this configuration.' };
    }
  },

  /** Reset OIDC configuration (admin only) */
  async resetConfig(): Promise<{ success: boolean }> {
    try {
      const response = await authAxios.delete('/oidc/config/reset');
      return response.data;
    } catch (error) {
      console.error('Error resetting OIDC config:', error);
      throw error;
    }
  },

  /**
   * Initiate the OIDC login flow. `emailHint` (I3) lets the server resolve
   * this tenant's own config for the flow.
   */
  async initiateLogin(emailHint?: string): Promise<void> {
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      sessionStorage.setItem('oidc_redirect_uri', redirectUri);

      const { authUrl, state } = await this.getAuthUrl(emailHint);

      sessionStorage.setItem('oidc_oauth_state', state);

      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating OIDC login:', error);
      throw error;
    }
  }
};

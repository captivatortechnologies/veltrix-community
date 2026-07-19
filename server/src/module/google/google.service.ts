import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config';
import { loggerService } from '../logger/logger.service';
import {
  GoogleConfigResponse,
  GoogleCallbackRequest,
  GoogleTokenExchangeRequest,
  GoogleAuthUrlResponse
} from './google.schema';
import {
  getOAuthConfig,
  saveOAuthConfig,
  resetOAuthConfig,
  exchangeTokensForJWT,
  handleOAuthError,
  OAuthFlowError,
  OAuthUserInfo,
  probeOAuthClientCredentials,
  fetchOidcDiscoveryDocument,
  TestConnectionResult
} from '../oauth/oauth.utils';
import { createOAuthFlowState, consumeOAuthState } from '../oauth/oauth-state.store';

const PROVIDER_TYPE = 'GOOGLE';
const PROVIDER_NAME = 'Google';
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const googleService = {
  /**
   * Get Google OAuth configuration
   */
  async getGoogleConfig(customerId?: string): Promise<GoogleConfigResponse | null> {
    try {
      // Try to get config from database
      const dbConfig = await getOAuthConfig(PROVIDER_TYPE, customerId);

      if (dbConfig) {
        return {
          enabled: dbConfig.enabled,
          clientId: dbConfig.clientId,
          clientSecret: dbConfig.clientSecret,
          redirectUri: dbConfig.redirectUri,
          scope: dbConfig.scope,
          isCustomerSpecific: dbConfig.isCustomerSpecific,
          jitMode: dbConfig.jitMode
        };
      }

      // Fallback to environment variables — no DB config row exists at all,
      // so there's nothing to backfill against; treat the same as a legacy,
      // pre-jitMode config.
      return {
        enabled: config.google?.enabled || false,
        clientId: config.google?.clientId || '',
        clientSecret: config.google?.clientSecret || '',
        redirectUri: config.google?.redirectUri || '',
        scope: config.google?.scopes || 'openid email profile',
        isCustomerSpecific: false,
        jitMode: 'legacy-first-customer'
      };
    } catch (error) {
      loggerService.error('Error getting Google config:', error);
      return null;
    }
  },

  /**
   * Save Google OAuth configuration
   */
  async saveGoogleConfig(data: GoogleConfigResponse, customerId?: string): Promise<boolean> {
    return saveOAuthConfig(PROVIDER_TYPE, PROVIDER_NAME, data, customerId);
  },

  /**
   * Reset customer-specific Google configuration
   */
  async resetGoogleConfig(customerId: string): Promise<boolean> {
    return resetOAuthConfig(PROVIDER_TYPE, customerId);
  },

  /**
   * Generate Google OAuth authorization URL
   */
  async getAuthUrl(customerId?: string): Promise<GoogleAuthUrlResponse> {
    try {
      const googleConfig = await this.getGoogleConfig(customerId);

      if (!googleConfig || !googleConfig.enabled) {
        throw new OAuthFlowError('provider_disabled', 'Google sign-in is not configured or is disabled.', 400);
      }

      const oauth2Client = new OAuth2Client(
        googleConfig.clientId,
        googleConfig.clientSecret,
        googleConfig.redirectUri
      );

      // I1: state (CSRF) + nonce (OIDC replay/substitution protection), both
      // tracked server-side (see oauth-state.store.ts) so the callback and
      // token-exchange legs of this flow can be validated, not just trusted.
      const { state, nonce } = await createOAuthFlowState(PROVIDER_TYPE, customerId);

      // Generate authorization URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: googleConfig.scope.split(' '),
        state,
        nonce,
        prompt: 'consent' // Force consent screen to always get refresh token
      });

      return {
        authUrl,
        state
      };
    } catch (error) {
      loggerService.error('Error generating Google auth URL:', error);
      throw error;
    }
  },

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   */
  async handleCallback(data: GoogleCallbackRequest, customerId?: string) {
    try {
      // I1: the `state` returned by Google must match one this server issued
      // via getAuthUrl and must not already have been consumed.
      const stateResult = await consumeOAuthState(data.state, PROVIDER_TYPE);
      if (!stateResult) {
        throw new OAuthFlowError(
          'invalid_state',
          'Your sign-in session could not be verified (it may have expired or already been used). Please try signing in again.',
          400
        );
      }

      const googleConfig = await this.getGoogleConfig(customerId ?? stateResult.customerId);

      if (!googleConfig || !googleConfig.enabled) {
        throw new OAuthFlowError('provider_disabled', 'Google sign-in is not configured or is disabled.', 400);
      }

      const oauth2Client = new OAuth2Client(
        googleConfig.clientId,
        googleConfig.clientSecret,
        data.redirectUri
      );

      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken(data.code);

      if (!tokens.id_token || !tokens.access_token) {
        throw new Error('Failed to get tokens from Google');
      }

      return {
        idToken: tokens.id_token,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        // Handed back to the client so it can be forwarded to /token-exchange,
        // which consumes it (one-time) and — where available — checks it
        // against the ID token's own `nonce` claim.
        nonce: stateResult.nonce
      };
    } catch (error) {
      loggerService.error('Error handling Google callback:', error);
      if (error instanceof OAuthFlowError) throw error;
      const oauthError = handleOAuthError(error);
      throw new Error(oauthError.message);
    }
  },

  /**
   * Verify ID token and get user information. When `expectedNonce` is
   * supplied, the token's own `nonce` claim must match it — standard OIDC
   * replay/substitution protection, in addition to the server-side nonce
   * consumption `exchangeTokensForJWT` performs.
   */
  async verifyIdToken(idToken: string, customerId?: string, expectedNonce?: string): Promise<OAuthUserInfo> {
    try {
      const googleConfig = await this.getGoogleConfig(customerId);

      if (!googleConfig || !googleConfig.enabled) {
        throw new OAuthFlowError('provider_disabled', 'Google sign-in is not configured or is disabled.', 400);
      }

      const oauth2Client = new OAuth2Client(googleConfig.clientId);

      // Verify the ID token
      const ticket = await oauth2Client.verifyIdToken({
        idToken,
        audience: googleConfig.clientId
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new Error('Invalid ID token payload');
      }

      if (expectedNonce && payload.nonce !== expectedNonce) {
        throw new OAuthFlowError('nonce_mismatch', 'Sign-in verification failed. Please try signing in again.', 400);
      }

      return {
        email: payload.email || '',
        name: payload.name,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        emailVerified: payload.email_verified || false,
        providerId: payload.sub // Google user ID
      };
    } catch (error) {
      loggerService.error('Error verifying Google ID token:', error);
      throw error;
    }
  },

  /**
   * Exchange Google tokens for application JWT
   */
  async exchangeGoogleTokens(data: GoogleTokenExchangeRequest, customerId?: string) {
    try {
      // Verify ID token and get user information
      const userInfo = await this.verifyIdToken(data.idToken, customerId, data.nonce);

      if (!userInfo.email || !userInfo.providerId) {
        throw new Error('Email or provider ID not found in token');
      }

      // I2: jitMode governs first-time provisioning — read from the same
      // config that authenticated this flow (customer-specific if resolved,
      // else global).
      const googleConfig = await this.getGoogleConfig(customerId);

      // Exchange for application JWT tokens. `data.nonce` is consumed here
      // (one-time) — see exchangeTokensForJWT's doc comment.
      return await exchangeTokensForJWT(userInfo, PROVIDER_TYPE, data.nonce, googleConfig?.jitMode);
    } catch (error) {
      loggerService.error('Error exchanging Google tokens:', error);
      throw error;
    }
  },

  /**
   * I4: validate a Google OAuth client configuration without requiring a
   * real login. Tests the *submitted* values (not what's saved), so an
   * admin can verify before saving. See the module comment above
   * probeOAuthClientCredentials in oauth.utils.ts for the technique.
   */
  async testConnection(data: { clientId?: string; clientSecret?: string; redirectUri?: string }): Promise<TestConnectionResult> {
    if (!data.clientId || !data.clientSecret) {
      return { success: false, message: 'Client ID and Client Secret are required.' };
    }

    const discovery = await fetchOidcDiscoveryDocument(GOOGLE_DISCOVERY_URL);
    if (!discovery) {
      return { success: false, message: "Could not reach Google's OIDC discovery endpoint. Check network connectivity from this server." };
    }

    const probe = await probeOAuthClientCredentials(GOOGLE_TOKEN_ENDPOINT, {
      grant_type: 'authorization_code',
      client_id: data.clientId,
      client_secret: data.clientSecret,
      code: 'veltrix-test-connection-probe',
      redirect_uri: data.redirectUri || 'https://veltrix.invalid/oauth/callback'
    });

    if (!probe.reachable) {
      return { success: false, message: `Could not reach Google's token endpoint: ${probe.errorMessage}` };
    }

    if (!probe.credentialsAccepted) {
      return {
        success: false,
        message: `Google rejected the Client ID / Client Secret pair (${probe.providerErrorCode}). Double-check both values.`
      };
    }

    return {
      success: true,
      message: 'Google accepted the Client ID / Client Secret pair.',
      details: ['OIDC discovery reachable.', `Token endpoint responded with "${probe.providerErrorCode || 'ok'}" for a test code — the client itself is valid.`]
    };
  }
};

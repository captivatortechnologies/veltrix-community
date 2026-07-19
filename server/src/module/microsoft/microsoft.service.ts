import { ConfidentialClientApplication, Configuration, AuthorizationUrlRequest, AuthorizationCodeRequest } from '@azure/msal-node';
import { config } from '../../config';
import { loggerService } from '../logger/logger.service';
import prisma from '../../db';
import {
  MicrosoftConfigResponse,
  MicrosoftCallbackRequest,
  MicrosoftTokenExchangeRequest,
  MicrosoftAuthUrlResponse
} from './microsoft.schema';
import {
  exchangeTokensForJWT,
  handleOAuthError,
  OAuthFlowError,
  OAuthUserInfo,
  probeOAuthClientCredentials,
  fetchOidcDiscoveryDocument,
  TestConnectionResult,
  type JitMode
} from '../oauth/oauth.utils';
import { createOAuthFlowState, consumeOAuthState } from '../oauth/oauth-state.store';
import { encryptFields, decryptFields } from '../../utils/encryption';
import axios from 'axios';

const PROVIDER_TYPE = 'AZURE';
const PROVIDER_NAME = 'Microsoft';

// I1: unlike Google (which routes through oauth.utils.getOAuthConfig/
// saveOAuthConfig), Microsoft has always had its own inline config
// read/write here — so it needs its own encryption-at-rest treatment for
// clientSecret. Idempotent/no-op on legacy plaintext or empty values (see
// utils/encryption.ts), so existing plaintext rows keep reading correctly.
const SENSITIVE_CONFIG_FIELDS = ['clientSecret'];

export const microsoftService = {
  /**
   * Get Microsoft OAuth configuration
   */
  async getMicrosoftConfig(customerId?: string): Promise<MicrosoftConfigResponse | null> {
    try {
      // Try to get config from database (customer-specific or global)
      if (customerId) {
        const customerConfig = await prisma.customerIdentityProvider.findFirst({
          where: {
            customerId,
            type: PROVIDER_TYPE
          }
        });

        if (customerConfig && customerConfig.enabled) {
          const configData = decryptFields(
            customerConfig.config ? JSON.parse(customerConfig.config as string) : {},
            SENSITIVE_CONFIG_FIELDS
          );

          return {
            enabled: customerConfig.enabled,
            clientId: (configData.clientId as string) || '',
            clientSecret: (configData.clientSecret as string) || '',
            tenantId: (configData.tenantId as string) || 'common',
            redirectUri: (configData.redirectUri as string) || '',
            scope: (configData.scope as string) || '',
            authority: (configData.authority as string) || `https://login.microsoftonline.com/${(configData.tenantId as string) || 'common'}`,
            isCustomerSpecific: true,
            jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer')
          };
        }
      }

      // Try to get global configuration
      const globalConfig = await prisma.identityProvider.findFirst({
        where: { type: PROVIDER_TYPE }
      });

      if (globalConfig && globalConfig.enabled) {
        const configData = decryptFields(
          globalConfig.config ? JSON.parse(globalConfig.config as string) : {},
          SENSITIVE_CONFIG_FIELDS
        );

        return {
          enabled: globalConfig.enabled,
          clientId: (configData.clientId as string) || '',
          clientSecret: (configData.clientSecret as string) || '',
          tenantId: (configData.tenantId as string) || 'common',
          redirectUri: (configData.redirectUri as string) || '',
          scope: (configData.scope as string) || '',
          authority: (configData.authority as string) || `https://login.microsoftonline.com/${(configData.tenantId as string) || 'common'}`,
          isCustomerSpecific: false,
          jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer')
        };
      }

      // Fallback to environment variables — no DB config row exists at all,
      // so treat the same as a legacy, pre-jitMode config.
      return {
        enabled: config.microsoft?.enabled || false,
        clientId: config.microsoft?.clientId || '',
        clientSecret: config.microsoft?.clientSecret || '',
        tenantId: config.microsoft?.tenantId || 'common',
        redirectUri: config.microsoft?.redirectUri || '',
        scope: config.microsoft?.scopes || 'openid email profile User.Read',
        authority: config.microsoft?.authority || `https://login.microsoftonline.com/${config.microsoft?.tenantId || 'common'}`,
        isCustomerSpecific: false,
        jitMode: 'legacy-first-customer'
      };
    } catch (error) {
      loggerService.error('Error getting Microsoft config:', error);
      return null;
    }
  },

  /**
   * Save Microsoft OAuth configuration. `clientSecret` is encrypted at rest
   * (I1). `jitMode` defaults to 'domain-match' for a brand-new config
   * (design decision 7); an update that doesn't specify jitMode preserves
   * whatever the existing config already had.
   */
  async saveMicrosoftConfig(data: MicrosoftConfigResponse, customerId?: string): Promise<boolean> {
    try {
      const existingConfigRow = customerId
        ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: PROVIDER_TYPE } })
        : await prisma.identityProvider.findFirst({ where: { type: PROVIDER_TYPE } });

      const previousJitMode = existingConfigRow
        ? ((JSON.parse((existingConfigRow.config as string) || '{}').jitMode as JitMode) || 'legacy-first-customer')
        : undefined;

      const configData = encryptFields(
        {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          tenantId: data.tenantId,
          redirectUri: data.redirectUri,
          scope: data.scope,
          authority: data.authority || `https://login.microsoftonline.com/${data.tenantId}`,
          jitMode: data.jitMode || previousJitMode || 'domain-match'
        },
        SENSITIVE_CONFIG_FIELDS
      );

      // If customerId is provided, save as customer-specific configuration
      if (customerId) {
        if (existingConfigRow) {
          // Update existing customer-specific config
          await prisma.customerIdentityProvider.update({
            where: { id: existingConfigRow.id },
            data: {
              enabled: data.enabled,
              config: JSON.stringify(configData)
            }
          });
        } else {
          // Create new customer-specific config
          await prisma.customerIdentityProvider.create({
            data: {
              customerId,
              name: PROVIDER_NAME,
              type: PROVIDER_TYPE,
              enabled: data.enabled,
              config: JSON.stringify(configData)
            }
          });
        }
      } else {
        // Save as global configuration
        if (existingConfigRow) {
          // Update existing global config
          await prisma.identityProvider.update({
            where: { id: existingConfigRow.id },
            data: {
              enabled: data.enabled,
              config: JSON.stringify(configData)
            }
          });
        } else {
          // Create new global config
          await prisma.identityProvider.create({
            data: {
              name: PROVIDER_NAME,
              type: PROVIDER_TYPE,
              enabled: data.enabled,
              config: JSON.stringify(configData)
            }
          });
        }
      }

      return true;
    } catch (error) {
      loggerService.error('Error saving Microsoft config:', error);
      return false;
    }
  },

  /**
   * Reset customer-specific Microsoft configuration
   */
  async resetMicrosoftConfig(customerId: string): Promise<boolean> {
    try {
      // Delete customer-specific configuration
      await prisma.customerIdentityProvider.deleteMany({
        where: {
          customerId,
          type: PROVIDER_TYPE
        }
      });

      return true;
    } catch (error) {
      loggerService.error('Error resetting Microsoft configuration:', error);
      return false;
    }
  },

  /**
   * Create MSAL Confidential Client Application
   */
  createMsalClient(microsoftConfig: MicrosoftConfigResponse): ConfidentialClientApplication {
    const msalConfig: Configuration = {
      auth: {
        clientId: microsoftConfig.clientId,
        authority: microsoftConfig.authority || `https://login.microsoftonline.com/${microsoftConfig.tenantId}`,
        clientSecret: microsoftConfig.clientSecret
      }
    };

    return new ConfidentialClientApplication(msalConfig);
  },

  /**
   * Generate Microsoft OAuth authorization URL
   */
  async getAuthUrl(customerId?: string): Promise<MicrosoftAuthUrlResponse> {
    try {
      const microsoftConfig = await this.getMicrosoftConfig(customerId);

      if (!microsoftConfig || !microsoftConfig.enabled) {
        throw new OAuthFlowError('provider_disabled', 'Microsoft sign-in is not configured or is disabled.', 400);
      }

      const msalClient = this.createMsalClient(microsoftConfig);

      // I1: state (CSRF) + nonce (OIDC replay/substitution protection), both
      // tracked server-side (see oauth-state.store.ts).
      const { state, nonce } = await createOAuthFlowState(PROVIDER_TYPE, customerId);

      // Generate authorization URL
      const authUrlRequest: AuthorizationUrlRequest = {
        scopes: microsoftConfig.scope.split(' '),
        redirectUri: microsoftConfig.redirectUri,
        state,
        nonce,
        prompt: 'select_account'
      };

      const authUrl = await msalClient.getAuthCodeUrl(authUrlRequest);

      return {
        authUrl,
        state
      };
    } catch (error) {
      loggerService.error('Error generating Microsoft auth URL:', error);
      throw error;
    }
  },

  /**
   * Handle OAuth callback and exchange authorization code for tokens
   */
  async handleCallback(data: MicrosoftCallbackRequest, customerId?: string) {
    try {
      // I1: the `state` returned by Microsoft must match one this server
      // issued via getAuthUrl and must not already have been consumed.
      const stateResult = await consumeOAuthState(data.state, PROVIDER_TYPE);
      if (!stateResult) {
        throw new OAuthFlowError(
          'invalid_state',
          'Your sign-in session could not be verified (it may have expired or already been used). Please try signing in again.',
          400
        );
      }

      const microsoftConfig = await this.getMicrosoftConfig(customerId ?? stateResult.customerId);

      if (!microsoftConfig || !microsoftConfig.enabled) {
        throw new OAuthFlowError('provider_disabled', 'Microsoft sign-in is not configured or is disabled.', 400);
      }

      const msalClient = this.createMsalClient(microsoftConfig);

      // Exchange authorization code for tokens
      const tokenRequest: AuthorizationCodeRequest = {
        code: data.code,
        scopes: microsoftConfig.scope.split(' '),
        redirectUri: data.redirectUri
      };

      const response = await msalClient.acquireTokenByCode(tokenRequest);

      if (!response.idToken || !response.accessToken) {
        throw new Error('Failed to get tokens from Microsoft');
      }

      // Defense-in-depth OIDC nonce check: MSAL doesn't automatically
      // correlate nonce across these two stateless calls (each uses a fresh
      // ConfidentialClientApplication with no shared cache), so compare the
      // returned ID token's own `nonce` claim against the one we minted.
      const idTokenNonce = (response.idTokenClaims as { nonce?: string } | undefined)?.nonce;
      if (idTokenNonce && idTokenNonce !== stateResult.nonce) {
        throw new OAuthFlowError('nonce_mismatch', 'Sign-in verification failed. Please try signing in again.', 400);
      }

      return {
        idToken: response.idToken,
        accessToken: response.accessToken,
        // Handed back to the client so it can be forwarded to /token-exchange,
        // which consumes it (one-time) — see exchangeTokensForJWT.
        nonce: stateResult.nonce
      };
    } catch (error) {
      loggerService.error('Error handling Microsoft callback:', error);
      if (error instanceof OAuthFlowError) throw error;
      const oauthError = handleOAuthError(error);
      throw new Error(oauthError.message);
    }
  },

  /**
   * Get user information from Microsoft Graph API
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      // Call Microsoft Graph API to get user information
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const userData = response.data;

      return {
        email: userData.mail || userData.userPrincipalName || '',
        name: userData.displayName,
        firstName: userData.givenName,
        lastName: userData.surname,
        emailVerified: true, // Microsoft accounts are always verified
        providerId: userData.id // Microsoft user ID
      };
    } catch (error) {
      loggerService.error('Error getting Microsoft user info:', error);
      throw error;
    }
  },

  /**
   * Exchange Microsoft tokens for application JWT
   */
  async exchangeMicrosoftTokens(data: MicrosoftTokenExchangeRequest, customerId?: string) {
    try {
      // Get user information using the access token
      const userInfo = await this.getUserInfo(data.accessToken);

      if (!userInfo.email || !userInfo.providerId) {
        throw new Error('Email or provider ID not found');
      }

      // I2: jitMode governs first-time provisioning — read from the same
      // config that authenticated this flow.
      const microsoftConfig = await this.getMicrosoftConfig(customerId);

      // Exchange for application JWT tokens. `data.nonce` is consumed here
      // (one-time) — this proves the caller is continuing a flow this server
      // brokered via /handle-callback, not replaying an unrelated Microsoft
      // access token obtained through a different app (see
      // exchangeTokensForJWT's doc comment).
      return await exchangeTokensForJWT(userInfo, PROVIDER_TYPE, data.nonce, microsoftConfig?.jitMode);
    } catch (error) {
      loggerService.error('Error exchanging Microsoft tokens:', error);
      throw error;
    }
  },

  /**
   * I4: validate a Microsoft/Azure AD OAuth client configuration without
   * requiring a real login. Tests the *submitted* values, not what's saved.
   */
  async testConnection(data: {
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    redirectUri?: string;
  }): Promise<TestConnectionResult> {
    if (!data.clientId || !data.clientSecret) {
      return { success: false, message: 'Client ID and Client Secret are required.' };
    }

    const tenantId = data.tenantId || 'common';
    const discoveryUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;

    const discovery = await fetchOidcDiscoveryDocument(discoveryUrl);
    if (!discovery) {
      return {
        success: false,
        message: `Could not find tenant "${tenantId}" (its OIDC discovery document was unreachable). Check the Tenant ID.`
      };
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const probe = await probeOAuthClientCredentials(tokenEndpoint, {
      grant_type: 'authorization_code',
      client_id: data.clientId,
      client_secret: data.clientSecret,
      code: 'veltrix-test-connection-probe',
      redirect_uri: data.redirectUri || 'https://veltrix.invalid/oauth/callback'
    });

    if (!probe.reachable) {
      return { success: false, message: `Could not reach the token endpoint for tenant "${tenantId}": ${probe.errorMessage}` };
    }

    if (!probe.credentialsAccepted) {
      return {
        success: false,
        message: `Azure AD rejected the Client ID / Client Secret pair (${probe.providerErrorCode}). Double-check both values and the Tenant ID.`
      };
    }

    return {
      success: true,
      message: 'Azure AD accepted the Client ID / Client Secret pair.',
      details: [`Tenant "${tenantId}" found.`, `Token endpoint responded with "${probe.providerErrorCode || 'ok'}" for a test code — the client itself is valid.`]
    };
  }
};

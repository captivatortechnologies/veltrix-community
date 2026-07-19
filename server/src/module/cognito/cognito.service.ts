import prisma from '../../db';
import { config } from '../../config';
import { CognitoTokenExchangeRequest, CognitoConfigResponse, CognitoCreateUserResponse, CognitoCallbackRequest } from './cognito.schema';
import { sign } from 'jsonwebtoken';
import { authService } from '../auth/auth.service';
import axios from 'axios';
import { loggerService } from '../../module/logger/logger.service';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoJwtVerifierSingleUserPool, CognitoJwtVerifierProperties } from 'aws-jwt-verify/cognito-verifier';
import { encryptFields, decryptFields } from '../../utils/encryption';
import {
  OAuthFlowError,
  findOrProvisionSsoUser,
  probeOAuthClientCredentials,
  fetchOidcDiscoveryDocument,
  type TestConnectionResult,
  type JitMode
} from '../oauth/oauth.utils';
import { createOAuthFlowState, consumeOAuthState, consumeOAuthNonce } from '../oauth/oauth-state.store';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AttributeType
} from '@aws-sdk/client-cognito-identity-provider';

const PROVIDER_TYPE = 'COGNITO';

// I1: `clientSecret` is the only secret persisted directly on the Cognito
// config blob today (AWS admin API credentials are wired in for I5). Encrypt
// at rest; both helpers are idempotent/no-op on legacy plaintext or empty
// values (see utils/encryption.ts), so existing plaintext rows keep reading
// correctly and get re-encrypted the next time the config is saved.
const SENSITIVE_CONFIG_FIELDS = ['clientSecret', 'awsAccessKeyId', 'awsSecretAccessKey'];

// ---------------------------------------------------------------------------
// I0 (CRITICAL): signature-verified ID token validation.
//
// The token-exchange path used to call jsonwebtoken's `decode()`, which reads
// the JWT payload WITHOUT checking the signature at all — any caller could
// hand-craft an unsigned (or garbage-signed) JWT with an arbitrary `email`/
// `sub` claim and mint a real Veltrix session for any user. `verifier.verify()`
// below fetches the user pool's JWKS, checks the signature, `token_use`
// (must be "id"), audience (`clientId`), issuer, and expiry — a forged token
// is rejected before any user lookup/creation happens.
//
// Verifiers are cached per (userPoolId, clientId) pair since they hold an
// in-memory JWKS cache that should be reused across requests rather than
// re-fetched every call.
// ---------------------------------------------------------------------------
const cognitoIdTokenVerifierCache = new Map<string, CognitoJwtVerifierSingleUserPool<CognitoJwtVerifierProperties>>();

function getCognitoIdTokenVerifier(userPoolId: string, clientId: string) {
  const cacheKey = `${userPoolId}::${clientId}`;
  let verifier = cognitoIdTokenVerifierCache.get(cacheKey);

  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: 'id'
    });
    cognitoIdTokenVerifierCache.set(cacheKey, verifier);
  }

  return verifier;
}

/** Exposed for tests that need to force a fresh verifier per case. */
export function __resetCognitoIdTokenVerifierCacheForTests(): void {
  cognitoIdTokenVerifierCache.clear();
}

export const cognitoService = {
  // Get Cognito configuration
  async getCognitoConfig(customerId?: string): Promise<CognitoConfigResponse | null> {
    try {
      // If customerId is provided, try to get customer-specific configuration
      if (customerId) {
        const customerConfig = await prisma.customerIdentityProvider.findFirst({
          where: {
            customerId,
            type: 'COGNITO'
          }
        });
        loggerService.debug('Customer-specific Cognito config:', customerConfig);

        // If customer has specific configuration, return it
        if (customerConfig && customerConfig.enabled) {
          const configData = decryptFields(
            customerConfig.config ? JSON.parse(customerConfig.config as string) : {},
            SENSITIVE_CONFIG_FIELDS
          );

          return {
            enabled: customerConfig.enabled,
            userPoolId: (configData.userPoolId as string) || '',
            userPoolRegion: (configData.userPoolRegion as string) || 'us-east-1',
            clientId: (configData.clientId as string) || '',
            clientSecret: (configData.clientSecret as string) || '',
            redirectUri: (configData.redirectUri as string) || '',
            logoutUri: (configData.logoutUri as string) || '',
            scope: (configData.scope as string) || 'phone openid email',
            isCustomerSpecific: true,
            jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer'),
            domain: (configData.domain as string) || '',
            awsAccessKeyId: (configData.awsAccessKeyId as string) || '',
            awsSecretAccessKey: (configData.awsSecretAccessKey as string) || ''
          };
        }
      }

      // If no customer-specific config or it's disabled, try to get global configuration
      const globalConfig = await prisma.identityProvider.findFirst({
        where: { type: 'COGNITO' }
      });

      // If global config exists in database, use it
      if (globalConfig && globalConfig.enabled) {
        const configData = decryptFields(
          globalConfig.config ? JSON.parse(globalConfig.config as string) : {},
          SENSITIVE_CONFIG_FIELDS
        );

        return {
          enabled: globalConfig.enabled,
          userPoolId: (configData.userPoolId as string) || '',
          userPoolRegion: (configData.userPoolRegion as string) || 'us-east-1',
          clientId: (configData.clientId as string) || '',
          clientSecret: (configData.clientSecret as string) || '',
          redirectUri: (configData.redirectUri as string) || '',
          logoutUri: (configData.logoutUri as string) || '',
          scope: (configData.scope as string) || 'phone openid email',
          isCustomerSpecific: false,
          jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer'),
          domain: (configData.domain as string) || '',
          awsAccessKeyId: (configData.awsAccessKeyId as string) || '',
          awsSecretAccessKey: (configData.awsSecretAccessKey as string) || ''
        };
      }

      // If no database config, use environment variables
      return {
        enabled: config.cognito.enabled,
        userPoolId: config.cognito.userPoolId,
        userPoolRegion: config.cognito.userPoolRegion,
        clientId: config.cognito.clientId,
        clientSecret: config.cognito.clientSecret,
        redirectUri: config.cognito.redirectUri,
        logoutUri: config.cognito.logoutUri,
        scope: config.cognito.scope,
        isCustomerSpecific: false,
        // No DB config row exists at all — nothing to backfill against, so
        // this is treated the same as a legacy, pre-jitMode config.
        jitMode: 'legacy-first-customer',
        domain: process.env.COGNITO_DOMAIN || '',
        awsAccessKeyId: process.env.COGNITO_AWS_ACCESS_KEY_ID || '',
        awsSecretAccessKey: process.env.COGNITO_AWS_SECRET_ACCESS_KEY || ''
      };
    } catch (error) {
      loggerService.error('Error getting Cognito config:', error);
      return null;
    }
  },

  // Save Cognito configuration
  async saveCognitoConfig(data: CognitoConfigResponse, customerId?: string): Promise<boolean> {
    try {
      const existingConfigRow = customerId
        ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: 'COGNITO' } })
        : await prisma.identityProvider.findFirst({ where: { type: 'COGNITO' } });

      const previousJitMode = existingConfigRow
        ? ((JSON.parse((existingConfigRow.config as string) || '{}').jitMode as JitMode) || 'legacy-first-customer')
        : undefined;

      const configData = encryptFields(
        {
          userPoolId: data.userPoolId,
          userPoolRegion: data.userPoolRegion,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          logoutUri: data.logoutUri,
          scope: data.scope,
          domain: data.domain || '',
          // I5: AWS credentials for Cognito admin API calls — optional,
          // encrypted at rest, with an env-var fallback when unset (see
          // resolveAwsCredentials).
          awsAccessKeyId: data.awsAccessKeyId || '',
          awsSecretAccessKey: data.awsSecretAccessKey || '',
          // I2: new configs default to domain-match; an update that doesn't
          // specify jitMode preserves whatever the config already had, so
          // saving other fields never silently changes JIT behavior.
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
              name: 'AWS Cognito',
              type: 'COGNITO',
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
              name: 'AWS Cognito',
              type: 'COGNITO',
              enabled: data.enabled,
              config: JSON.stringify(configData)
            }
          });
        }
      }

      return true;
    } catch (error) {
      loggerService.error('Error saving Cognito config:', error);
      return false;
    }
  },

  /**
   * URGENT security fix (2026-07-11): read the previously-stored
   * clientSecret/awsSecretAccessKey for the EXACT save target (the
   * customer-specific row when `customerId` is given, else the global row)
   * — deliberately NOT the fallback chain `getCognitoConfig` uses for
   * login/admin-API calls, so a preserve-on-omit save never
   * cross-contaminates a brand-new customer-specific override with the
   * global secrets (or vice versa). Mirrors oauth.utils.ts's
   * `getStoredClientSecret`, kept here because Cognito stores/decrypts its
   * config independently (see the module comment on SENSITIVE_CONFIG_FIELDS
   * above).
   */
  async getStoredCognitoSecrets(customerId?: string): Promise<{ clientSecret?: string; awsSecretAccessKey?: string }> {
    try {
      const row = customerId
        ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: PROVIDER_TYPE } })
        : await prisma.identityProvider.findFirst({ where: { type: PROVIDER_TYPE } });

      if (!row?.config) return {};

      const configData = decryptFields(JSON.parse(row.config as string), SENSITIVE_CONFIG_FIELDS);
      return {
        clientSecret: (configData.clientSecret as string) || undefined,
        awsSecretAccessKey: (configData.awsSecretAccessKey as string) || undefined
      };
    } catch (error) {
      loggerService.error('Error reading stored Cognito secrets:', error);
      return {};
    }
  },

  /**
   * I5: resolve the AWS credentials used for Cognito *admin* API calls
   * (AdminCreateUser, ListUsers, AdminDeleteUser). These are NOT needed for
   * the actual login/token-exchange flow (I0's aws-jwt-verify checks the ID
   * token's signature against the pool's public JWKS — no AWS credentials
   * required), only for the admin-console user-management features below.
   *
   * Config-first (the awsAccessKeyId/awsSecretAccessKey saved on this
   * Cognito config — customer-specific, then global, both encrypted at
   * rest), falling back to the COGNITO_AWS_ACCESS_KEY_ID/
   * COGNITO_AWS_SECRET_ACCESS_KEY env vars. This is what removes the
   * "configure Cognito in the UI, then restart the server" requirement for
   * admin operations — previously these were read directly from
   * process.env at every call site. Returns null when neither source has a
   * usable pair.
   */
  async resolveAwsCredentials(customerId?: string): Promise<{ accessKeyId: string; secretAccessKey: string } | null> {
    const cognitoConfig = await this.getCognitoConfig(customerId);

    if (cognitoConfig?.awsAccessKeyId && cognitoConfig?.awsSecretAccessKey) {
      return { accessKeyId: cognitoConfig.awsAccessKeyId, secretAccessKey: cognitoConfig.awsSecretAccessKey };
    }

    if (process.env.COGNITO_AWS_ACCESS_KEY_ID && process.env.COGNITO_AWS_SECRET_ACCESS_KEY) {
      return { accessKeyId: process.env.COGNITO_AWS_ACCESS_KEY_ID, secretAccessKey: process.env.COGNITO_AWS_SECRET_ACCESS_KEY };
    }

    return null;
  },

  /**
   * Whether Cognito admin API calls have usable AWS credentials for this
   * scope (config or env). Exposed so callers outside this service (e.g.
   * auth.service.ts's LOCAL-login Cognito-detection fallback, which
   * currently gates on `process.env.COGNITO_AWS_ACCESS_KEY_ID` directly)
   * can check config-aware availability instead of only the env var — see
   * the I5 note in the RBAC/IdP hardening plan for the exact call sites.
   */
  async hasAwsCredentialsConfigured(customerId?: string): Promise<boolean> {
    return (await this.resolveAwsCredentials(customerId)) !== null;
  },

  // Reset customer-specific Cognito configuration to use global configuration
  async resetCognitoConfig(customerId: string): Promise<boolean> {
    try {
      // Delete customer-specific configuration
      await prisma.customerIdentityProvider.deleteMany({
        where: {
          customerId,
          type: 'COGNITO'
        }
      });

      return true;
    } catch (error) {
      loggerService.error('Error resetting Cognito configuration:', error);
      return false;
    }
  },

  /**
   * Generate the AWS Cognito Hosted UI authorization URL.
   *
   * I3/instant-on fix: the client used to build this URL itself with a
   * hardcoded hosted-UI domain (`us-east-26hlvgruzf.auth.us-east-2...`) that
   * has no relationship to whatever `userPoolId`/`domain` an admin actually
   * configures via the UI — "configure in UI" could never "work instantly"
   * for a different pool. This now resolves the domain and redirect URI from
   * the actual configuration (customer-specific → global → env), and — like
   * Google/Microsoft — mints server-side state + nonce (I1).
   */
  async getAuthUrl(customerId?: string): Promise<{ authUrl: string; state: string }> {
    try {
      const cognitoConfig = await this.getCognitoConfig(customerId);

      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId || !cognitoConfig.clientId) {
        throw new OAuthFlowError('provider_disabled', 'AWS Cognito sign-in is not configured or is disabled.', 400);
      }

      if (!cognitoConfig.domain) {
        throw new OAuthFlowError(
          'provider_misconfigured',
          'AWS Cognito is missing its Hosted UI domain. Configure it in Identity Providers before enabling sign-in.',
          400
        );
      }

      if (!cognitoConfig.redirectUri) {
        throw new OAuthFlowError(
          'provider_misconfigured',
          'AWS Cognito is missing its redirect URI. Configure it in Identity Providers before enabling sign-in.',
          400
        );
      }

      const { state, nonce } = await createOAuthFlowState(PROVIDER_TYPE, customerId);

      const authUrl = `https://${cognitoConfig.domain}/oauth2/authorize?${new URLSearchParams({
        client_id: cognitoConfig.clientId,
        response_type: 'code',
        scope: cognitoConfig.scope || 'phone openid email',
        redirect_uri: cognitoConfig.redirectUri,
        state,
        nonce
      }).toString()}`;

      return { authUrl, state };
    } catch (error) {
      loggerService.error('Error generating Cognito auth URL:', error);
      throw error;
    }
  },

  /**
   * Exchange a Cognito authorization code for tokens. Validates the
   * server-side `state` (I1) before talking to Cognito, and resolves the
   * token endpoint from the same `domain` used to build the authorize URL
   * (previously built from `userPoolId`, which is not the hosted-UI domain).
   */
  async handleCallback(data: CognitoCallbackRequest, customerId?: string) {
    const stateResult = await consumeOAuthState(data.state, PROVIDER_TYPE);
    if (!stateResult) {
      throw new OAuthFlowError(
        'invalid_state',
        'Your sign-in session could not be verified (it may have expired or already been used). Please try signing in again.',
        400
      );
    }

    const cognitoConfig = await this.getCognitoConfig(customerId ?? stateResult.customerId);

    if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId || !cognitoConfig.clientId) {
      throw new OAuthFlowError('provider_disabled', 'AWS Cognito sign-in is not configured or is disabled.', 400);
    }

    if (!cognitoConfig.domain) {
      throw new OAuthFlowError(
        'provider_misconfigured',
        'AWS Cognito is missing its Hosted UI domain. Configure it in Identity Providers before enabling sign-in.',
        400
      );
    }

    const tokenEndpoint = `https://${cognitoConfig.domain}/oauth2/token`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cognitoConfig.clientId,
      code: data.code,
      redirect_uri: data.redirectUri
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (cognitoConfig.clientSecret) {
      const basic = Buffer.from(`${cognitoConfig.clientId}:${cognitoConfig.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${basic}`;
    }

    try {
      const response = await axios.post(tokenEndpoint, body.toString(), { headers });

      return {
        idToken: response.data.id_token,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        // Handed back to the client so it can be forwarded to /token-exchange,
        // which consumes it (one-time) — see exchangeTokensForJWT.
        nonce: stateResult.nonce
      };
    } catch (error) {
      loggerService.error('Error exchanging Cognito authorization code:', error);
      throw new OAuthFlowError('oauth_error', 'Failed to exchange the authorization code with AWS Cognito.', 400);
    }
  },

  /**
   * I4: validate an AWS Cognito configuration without requiring a real
   * login. Tests the *submitted* values, not what's saved. Two independent
   * checks: (1) does the user pool exist in this region (OIDC discovery),
   * (2) if a Hosted UI domain is configured, does it accept the Client
   * ID/Secret pair. The domain is genuinely optional at this point in a
   * fresh setup, so its absence is reported, not treated as a failure.
   */
  async testConnection(data: {
    userPoolId?: string;
    userPoolRegion?: string;
    clientId?: string;
    clientSecret?: string;
    domain?: string;
  }): Promise<TestConnectionResult> {
    if (!data.userPoolId || !data.clientId) {
      return { success: false, message: 'User Pool ID and Client ID are required.' };
    }

    const region = data.userPoolRegion || 'us-east-1';
    const discoveryUrl = `https://cognito-idp.${region}.amazonaws.com/${data.userPoolId}/.well-known/openid-configuration`;

    const discovery = await fetchOidcDiscoveryDocument(discoveryUrl);
    if (!discovery) {
      return {
        success: false,
        message: `Could not find user pool "${data.userPoolId}" in region "${region}". Check the User Pool ID and Region.`
      };
    }

    const details: string[] = [`User pool found in region "${region}" (issuer: ${discovery.issuer as string}).`];

    if (!data.domain) {
      details.push('No Hosted UI domain is configured yet — client credential validation and sign-in were skipped.');
      return {
        success: true,
        message: 'The user pool is reachable, but sign-in will not work until a Hosted UI domain is configured.',
        details
      };
    }

    const probe = await probeOAuthClientCredentials(`https://${data.domain}/oauth2/token`, {
      grant_type: 'authorization_code',
      client_id: data.clientId,
      client_secret: data.clientSecret || '',
      code: 'veltrix-test-connection-probe',
      redirect_uri: 'https://veltrix.invalid/auth/cognito/callback'
    });

    if (!probe.reachable) {
      return {
        success: false,
        message: `User pool found, but the Hosted UI domain "${data.domain}" is not reachable: ${probe.errorMessage}`,
        details
      };
    }

    if (!probe.credentialsAccepted) {
      return {
        success: false,
        message: `AWS Cognito rejected the Client ID / Client Secret pair (${probe.providerErrorCode}). Double-check both values.`,
        details
      };
    }

    details.push('Hosted UI domain is reachable and the Client ID / Client Secret pair was accepted.');
    return { success: true, message: 'AWS Cognito configuration looks good.', details };
  },

  // Disable Cognito when another SSO option is selected
  async disableCognitoForSso(customerId: string, ssoType: string): Promise<boolean> {
    try {
      // First, check if customer has a specific Cognito configuration
      const customerCognitoConfig = await prisma.customerIdentityProvider.findFirst({
        where: {
          customerId,
          type: 'COGNITO'
        }
      });
      
      // If customer has a specific Cognito configuration, update it to disabled
      if (customerCognitoConfig) {
        await prisma.customerIdentityProvider.update({
          where: { id: customerCognitoConfig.id },
          data: { enabled: false }
        });
      } else {
        // If no customer-specific configuration, create one that's disabled
        // This effectively overrides the global configuration
        await prisma.customerIdentityProvider.create({
          data: {
            customerId,
            name: 'AWS Cognito',
            type: 'COGNITO',
            enabled: false,
            config: '{}' // Empty config since it's disabled
          }
        });
      }
      
      // Enable the selected SSO provider
      const existingSsoConfig = await prisma.customerIdentityProvider.findFirst({
        where: {
          customerId,
          type: ssoType
        }
      });
      
      if (existingSsoConfig) {
        // Update existing SSO configuration
        await prisma.customerIdentityProvider.update({
          where: { id: existingSsoConfig.id },
          data: { enabled: true }
        });
      } else {
        // Create new SSO configuration (with minimal config)
        await prisma.customerIdentityProvider.create({
          data: {
            customerId,
            name: `${ssoType} Provider`,
            type: ssoType,
            enabled: true,
            config: '{}'
          }
        });
      }
      
      return true;
    } catch (error) {
      loggerService.error(`Error disabling Cognito for SSO type ${ssoType}:`, error);
      return false;
    }
  },
  
  // Check if a user exists in Cognito
  async checkUserExistsInCognito(email: string, customerId?: string): Promise<boolean> {
    try {
      // Get Cognito configuration
      const cognitoConfig = await this.getCognitoConfig(customerId);
      
      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId) {
        loggerService.warn('Cognito is not configured or disabled');
        return false;
      }
      
      // I5: config-first with env fallback — see resolveAwsCredentials.
      const awsCredentials = await this.resolveAwsCredentials(customerId);
      if (!awsCredentials) {
        loggerService.warn('Cognito AWS credentials are not configured');
        return false;
      }

      // Create Cognito client
      const client = new CognitoIdentityProviderClient({
        region: cognitoConfig.userPoolRegion,
        credentials: awsCredentials
      });

      // Try to get the user by email attribute
      try {
        // We'll use ListUsers, which allows searching by attributes
        const { ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
        
        const listUsersCommand = new ListUsersCommand({
          UserPoolId: cognitoConfig.userPoolId,
          Filter: `email = "${email}"`
        });
        
        const response = await client.send(listUsersCommand);
        
        // If we found any users with this email, the user exists
        return !!(response.Users && response.Users.length > 0);
        
      } catch (error) {
        loggerService.error('Error checking if user exists in Cognito:', error);
        return false;
      }
    } catch (error) {
      loggerService.error('Error checking if user exists in Cognito:', error);
      return false;
    }
  },
  
  // Create a user in Cognito
  async createUserInCognito(userData: {
    email: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    password?: string; // Make password optional
    roleId: number | string;
    customerId?: string;
  }): Promise<CognitoCreateUserResponse> {
    try {
      // SECURITY: no silent default tenant. A missing customerId here used to
      // fall back to a fixed placeholder org id, which would attach the new
      // user (in both the Cognito custom:customerId attribute and the local
      // User row) to whatever tenant happened to own that id — a
      // cross-tenant data-integrity bug, not a convenience. Callers must
      // supply the real organization id explicitly.
      if (!userData.customerId) {
        return {
          success: false,
          error: 'customerId is required to create a Cognito-backed user'
        };
      }

      // Get Cognito configuration
      const cognitoConfig = await this.getCognitoConfig(userData.customerId);

      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId) {
        return {
          success: false,
          error: 'Cognito is not configured or disabled'
        };
      }

      // Get the role information to store as a custom attribute
      // The roleId must be a valid UUID from the database
      let role;
      try {
        // First, try to find the role by ID directly
        role = await prisma.role.findUnique({
          where: { id: String(userData.roleId) }
        });
        
        if (!role) {
          loggerService.error(`Role with ID ${userData.roleId} not found in the database`);
          return {
            success: false,
            error: `Role with ID ${userData.roleId} not found in the database. Please select a valid role.`
          };
        }
      } catch (error) {
        loggerService.error('Error finding role:', error);
        return {
          success: false,
          error: 'Error finding role in the database'
        };
      }
      
      // I5: config-first with env fallback — see resolveAwsCredentials.
      const awsCredentials = await this.resolveAwsCredentials(userData.customerId);
      if (!awsCredentials) {
        return {
          success: false,
          error: 'AWS credentials for Cognito admin operations are not configured. Configure them in Identity Providers, or set COGNITO_AWS_ACCESS_KEY_ID/COGNITO_AWS_SECRET_ACCESS_KEY.'
        };
      }

      // Create Cognito client
      const client = new CognitoIdentityProviderClient({
        region: cognitoConfig.userPoolRegion,
        credentials: awsCredentials
      });

      // Define user attributes based on the required attributes in the Cognito user pool schema
      const userAttributes: AttributeType[] = [
        // Required standard attributes
        { Name: 'email', Value: userData.email },
        { Name: 'email_verified', Value: 'true' },
        
        // Handle given_name and family_name (required attributes)
        { Name: 'given_name', Value: userData.firstName || (userData.name ? userData.name.split(' ')[0] : userData.email.split('@')[0]) },
        { Name: 'family_name', Value: userData.lastName || (userData.name ? userData.name.split(' ').slice(1).join(' ') : '') },
        
        // Phone number - use provided or default
        { Name: 'phone_number', Value: userData.phoneNumber || '+12345678900' },
        
        // Default values for other required attributes
        { Name: 'picture', Value: 'https://via.placeholder.com/150' },
        
        // Custom attributes that are defined in the Cognito user pool schema.
        // customerId is guaranteed non-empty by the fail-fast check above.
        { Name: 'custom:customerId', Value: userData.customerId },
        { Name: 'custom:RoleId', Value: String(role.id) }
      ];
      
      // Generate a unique username (not email format)
      // Use a combination of name and random string
      const displayName = userData.name || 
                         (userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : 
                         (userData.firstName || userData.lastName || userData.email.split('@')[0]));
      
      const username = `user_${displayName.replace(/\s+/g, '_').toLowerCase()}_${Date.now().toString(36)}`;
      
      // Create the user in Cognito with auto-generated password
      const createUserCommand = new AdminCreateUserCommand({
        UserPoolId: cognitoConfig.userPoolId,
        Username: username,
        // Let Cognito generate a temporary password and send it to the user's email
        // If password is provided, use it (for testing), otherwise let Cognito generate one
        ...(userData.password ? { TemporaryPassword: userData.password, MessageAction: 'SUPPRESS' } : {}),
        UserAttributes: userAttributes
      });
      
      const createUserResponse = await client.send(createUserCommand);
      
      if (!createUserResponse.User || !createUserResponse.User.Username) {
        return {
          success: false,
          error: 'Failed to create user in Cognito'
        };
      }
      
      // Only set a permanent password if one was provided (for testing)
      if (userData.password) {
        // Set the user's password (to avoid the forced password change)
        const setPasswordCommand = new AdminSetUserPasswordCommand({
          UserPoolId: cognitoConfig.userPoolId,
          Username: username,
          Password: userData.password,
          Permanent: true
        });
        
        await client.send(setPasswordCommand);
      }
      
      // Return the Cognito user ID (sub)
      const cognitoUserId = createUserResponse.User.Attributes?.find(attr => attr.Name === 'sub')?.Value || 
                           createUserResponse.User.Username;
      
      // Save the user to the database
      let dbUser;
      try {
        // Create a new user in the database with the Cognito user ID as the email
        dbUser = await prisma.user.create({
          data: {
            email: cognitoUserId, // Store the Cognito user ID in the email field
            name: userData.name,
            firstName: userData.firstName,
            lastName: userData.lastName,
            phoneNumber: userData.phoneNumber,
            roleId: String(userData.roleId),
            // Guaranteed non-empty by the fail-fast check above.
            customerId: userData.customerId,
            authProvider: 'COGNITO'
          }
        });
        
      } catch (dbError) {
        loggerService.error('Error creating user in database:', dbError);
        // We don't want to fail the entire operation if the database save fails
        // The user is already created in Cognito, so we'll just log the error and continue
      }
      
      return {
        success: true,
        cognitoUserId: cognitoUserId,
        dbUser: dbUser ? dbUser : undefined, // Include the database user in the response if it was created
        dbSaveSuccess: !!dbUser // Include a flag indicating if the database save was successful
      };
    } catch (error) {
      loggerService.error('Error creating user in Cognito:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating user in Cognito'
      };
    }
  },
  
  // Get all users from Cognito
  async getCognitoUsers(customerId?: string) {
    try {
      // Get Cognito configuration
      const cognitoConfig = await this.getCognitoConfig(customerId);
      
      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId) {
        loggerService.warn('Cognito is not configured or disabled');
        return [];
      }

      // I5: config-first with env fallback — see resolveAwsCredentials.
      const awsCredentials = await this.resolveAwsCredentials(customerId);
      if (!awsCredentials) {
        loggerService.warn('Cognito AWS credentials are not configured');
        return [];
      }

      // Create Cognito client
      const client = new CognitoIdentityProviderClient({
        region: cognitoConfig.userPoolRegion,
        credentials: awsCredentials
      });
      
      // List all users in the Cognito user pool
      const { ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: cognitoConfig.userPoolId,
        // Limit to 60 users for performance reasons
        Limit: 60
      });
      
      const response = await client.send(listUsersCommand);
      
      if (!response.Users || response.Users.length === 0) {
        return [];
      }
      
      // Transform Cognito users to our format
      const users = await Promise.all(response.Users.map(async (user) => {
        // Extract user attributes
        const attributes = user.Attributes || [];
        const email = attributes.find(attr => attr.Name === 'email')?.Value || '';
        const givenName = attributes.find(attr => attr.Name === 'given_name')?.Value || '';
        const familyName = attributes.find(attr => attr.Name === 'family_name')?.Value || '';
        const phoneNumber = attributes.find(attr => attr.Name === 'phone_number')?.Value || '';
        // Empty (not a placeholder tenant id) when a Cognito user predates
        // the custom:customerId attribute being set — the admin UI should
        // treat that as "unassigned", not silently attribute it to a
        // specific organization.
        const customerId = attributes.find(attr => attr.Name === 'custom:customerId')?.Value || '';
        const roleId = attributes.find(attr => attr.Name === 'custom:RoleId')?.Value || '';
        const sub = attributes.find(attr => attr.Name === 'sub')?.Value || user.Username || '';
        
        // Get role name from database
        let roleName = 'User'; // Default role name
        if (roleId) {
          try {
            const role = await prisma.role.findUnique({
              where: { id: roleId }
            });
            if (role) {
              roleName = role.name;
            }
          } catch (error) {
            loggerService.error('Error fetching role:', error);
          }
        }
        
        // Check if user exists in database
        let dbUser = null;
        try {
          dbUser = await prisma.user.findFirst({
            where: {
              email: sub,
              authProvider: 'COGNITO'
            }
          });
        } catch (error) {
          loggerService.error('Error checking if user exists in database:', error);
        }
        
        return {
          id: sub,
          email: email,
          name: `${givenName} ${familyName}`.trim() || null,
          firstName: givenName || null,
          lastName: familyName || null,
          phoneNumber: phoneNumber || null,
          role: roleName,
          customerId: customerId,
          authProvider: 'COGNITO',
          // Include database ID if user exists in database
          dbId: dbUser?.id || null
        };
      }));
      
      return users;
    } catch (error) {
      loggerService.error('Error getting Cognito users:', error);
      return [];
    }
  },
  
  // Delete a user from Cognito
  async deleteUserFromCognito(email: string, customerId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get Cognito configuration
      const cognitoConfig = await this.getCognitoConfig(customerId);
      
      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId) {
        return { 
          success: false, 
          error: 'Cognito is not configured or disabled' 
        };
      }
      
      loggerService.info(`Attempting to find and delete Cognito user with email: ${email} from pool: ${cognitoConfig.userPoolId}`);

      // I5: config-first with env fallback — see resolveAwsCredentials.
      const awsCredentials = await this.resolveAwsCredentials(customerId);
      if (!awsCredentials) {
        return {
          success: false,
          error: 'AWS credentials for Cognito admin operations are not configured. Configure them in Identity Providers, or set COGNITO_AWS_ACCESS_KEY_ID/COGNITO_AWS_SECRET_ACCESS_KEY.'
        };
      }

      // Create Cognito client
      const client = new CognitoIdentityProviderClient({
        region: cognitoConfig.userPoolRegion,
        credentials: awsCredentials
      });
      
      // First, find the user by email to get their username
      const { ListUsersCommand, AdminDeleteUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
      
      const listUsersCommand = new ListUsersCommand({
        UserPoolId: cognitoConfig.userPoolId,
        Filter: `email = "${email}"`
      });
      
      loggerService.debug(`Searching for user with email: ${email}`);
      const response = await client.send(listUsersCommand);
      
      // Log the full response for debugging
      loggerService.debug('ListUsersCommand response:', { response: JSON.stringify(response, null, 2) });
      
      if (!response.Users || response.Users.length === 0) {
        loggerService.warn(`No user found with email: ${email}`);
        return {
          success: false,
          error: `No user found with email: ${email}`
        };
      }
      
      // Log the found users for debugging
      loggerService.info(`Found ${response.Users.length} users with email ${email}`);
      response.Users.forEach((user, index) => {
        loggerService.debug(`User ${index + 1} details:`, {
          username: user.Username,
          enabled: user.Enabled,
          status: user.UserStatus,
          attributes: user.Attributes
        });
      });
      
      // Get the username from the first user in the response
      const username = response.Users[0].Username;
      
      if (!username) {
        loggerService.error('Username not found for user');
        return {
          success: false,
          error: 'Username not found for user'
        };
      }
      
      loggerService.info(`Found user with username: ${username}`);
      
      // Delete the user from Cognito using the username
      const deleteUserCommand = new AdminDeleteUserCommand({
        UserPoolId: cognitoConfig.userPoolId,
        Username: username
      });
      
      await client.send(deleteUserCommand);
      loggerService.info(`Successfully deleted user ${username} from Cognito`);
      
      return {
        success: true
      };
    } catch (error) {
      loggerService.error('Error deleting user from Cognito:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error deleting user from Cognito'
      };
    }
  },
  
  // Exchange Cognito tokens for a JWT token
  async exchangeCognitoTokens(data: CognitoTokenExchangeRequest) {
    try {
      // I1: `data.nonce` must be one this server minted at /auth-url time and
      // handed back via /handle-callback — proves this call is continuing a
      // flow the server itself brokered (blocks token-substitution against
      // this otherwise-public endpoint). See exchangeTokensForJWT's doc
      // comment in oauth.utils.ts for the full rationale (shared by all
      // three providers).
      let nonceCustomerId: string | undefined;
      if (data.nonce) {
        const nonceRecord = await consumeOAuthNonce(data.nonce, PROVIDER_TYPE);
        if (!nonceRecord) {
          throw new OAuthFlowError(
            'invalid_nonce',
            'This sign-in link has expired or was already used. Please sign in again.',
            400
          );
        }
        nonceCustomerId = nonceRecord.customerId;
      }

      // Resolve the pool configuration used to verify this token. Verification
      // MUST use the same pool/client the token claims to be issued for —
      // never trust the token's own claims about which pool issued it.
      const cognitoConfig = await this.getCognitoConfig(nonceCustomerId);

      if (!cognitoConfig || !cognitoConfig.enabled || !cognitoConfig.userPoolId || !cognitoConfig.clientId) {
        throw new OAuthFlowError('provider_disabled', 'AWS Cognito sign-in is not configured or is disabled.', 400);
      }

      // Signature-verify the ID token against the pool's JWKS (I0 fix — see
      // the module-level comment above getCognitoIdTokenVerifier). Any
      // unsigned, mis-signed, expired, wrong-audience, or wrong-token-use
      // token is rejected here, before any user lookup/creation happens.
      let decodedToken: Record<string, unknown>;
      try {
        const verifier = getCognitoIdTokenVerifier(cognitoConfig.userPoolId, cognitoConfig.clientId);
        decodedToken = (await verifier.verify(data.idToken)) as unknown as Record<string, unknown>;
      } catch (verifyError) {
        loggerService.warn('Rejected Cognito ID token that failed signature/claims verification:', verifyError);
        throw new OAuthFlowError('invalid_token', 'Invalid Cognito ID token: signature verification failed', 401);
      }

      // Defense-in-depth OIDC nonce check: the ID token's own `nonce` claim
      // (echoed back by Cognito from the authorize request) must match the
      // nonce we just proved was server-issued.
      if (data.nonce && decodedToken.nonce !== data.nonce) {
        throw new OAuthFlowError('nonce_mismatch', 'Sign-in verification failed. Please try signing in again.', 400);
      }

      // Extract user information from the token
      const email = decodedToken.email as string;
      const name = decodedToken.name as string;
      const cognitoUserId = decodedToken.sub as string; // AWS Cognito User ID (sub claim)

      if (!email) {
        throw new Error('Email not found in token');
      }

      if (!cognitoUserId) {
        throw new Error('Cognito User ID (sub) not found in token');
      }

      const givenName = (decodedToken.given_name as string) || '';
      const familyName = (decodedToken.family_name as string) || '';
      const phoneNumber = (decodedToken.phone_number as string) || null;

      // I2: returning-user lookup (providerAccountId OR email OR legacy
      // email===providerId) + jitMode-governed provisioning for genuinely
      // new identities — shared with Google/Microsoft, see
      // findOrProvisionSsoUser's doc comment in oauth.utils.ts.
      const user = await findOrProvisionSsoUser({
        authProvider: 'COGNITO',
        providerId: cognitoUserId,
        email,
        displayName: name,
        firstName: givenName || null,
        lastName: familyName || null,
        phoneNumber,
        jitMode: cognitoConfig.jitMode || 'legacy-first-customer'
      });

      // I1 gate parity: LOCAL login (auth.service.ts) rejects both a
      // deactivated user account and a suspended/inactive organization — SSO
      // must enforce the exact same two checks (previously only checked
      // `customer.isActive`, so a deactivated *user* could still mint a
      // session via Cognito SSO).
      if (!user.isActive) {
        throw new OAuthFlowError('user_inactive', 'Your account has been deactivated. Contact your administrator.', 403);
      }

      if (!user.customer.isActive) {
        throw new OAuthFlowError(
          'tenant_suspended',
          "Your organization's account is not active. Contact your administrator.",
          403
        );
      }

      // Design decision 8: local TOTP 2FA applies to LOCAL logins only — the
      // IdP is responsible for MFA on SSO sessions. This exchange therefore
      // mints tokens directly, with no 2FA challenge step.
      const tokens = authService.generateTokens(user.id, user.email, user.customerId, user.roleId);
      
      return {
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        expires_in: tokens.expires_in,
        refresh_expires_in: tokens.refresh_expires_in,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          phoneNumber: user.phoneNumber || '',
          role: user.role.name,
          customerId: user.customerId,
          authProvider: 'COGNITO'
        }
      };
    } catch (error) {
      loggerService.error('Error exchanging Cognito tokens:', error);
      throw error;
    }
  }
};

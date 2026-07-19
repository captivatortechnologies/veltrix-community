import axios from 'axios';
import { createLocalJWKSet, jwtVerify, errors as joseErrors, type JWTPayload } from 'jose';
import prisma from '../../db';
import { loggerService } from '../logger/logger.service';
import { encryptFields, decryptFields } from '../../utils/encryption';
import {
  OAuthFlowError,
  OAuthUserInfo,
  exchangeTokensForJWT,
  probeOAuthClientCredentials,
  fetchOidcDiscoveryDocument,
  type JitMode,
  type TestConnectionResult
} from '../oauth/oauth.utils';
import { createOAuthFlowState, consumeOAuthState, consumeOAuthNonce } from '../oauth/oauth-state.store';
import { OidcConfigResponse, OidcCallbackRequest, OidcTokenExchangeRequest, OidcAuthUrlResponse } from './oidc.schema';

const PROVIDER_TYPE = 'OIDC';
const PROVIDER_NAME = 'Generic OIDC';

// `clientSecret` is the only secret persisted on this config blob — encrypted
// at rest, same pattern (and same idempotent-on-legacy-plaintext helpers) as
// every other provider.
const SENSITIVE_CONFIG_FIELDS = ['clientSecret'];

// ---------------------------------------------------------------------------
// OIDC discovery (`{issuer}/.well-known/openid-configuration`), cached per
// issuer. Login (`getAuthUrl`/`handleCallback`/`token-exchange`) is a hot
// path — refetching discovery on every request would add an avoidable
// network round trip to every login. `forceRefresh` is used by
// `testConnection` (an admin actively validating a just-edited config should
// always see live data, not a stale cache) and is available for callers that
// need to bypass a bad cached entry.
// ---------------------------------------------------------------------------

interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;
const discoveryCache = new Map<string, { doc: OidcDiscoveryDocument; expiresAt: number }>();

function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '');
}

async function discoverOidcConfiguration(issuer: string, forceRefresh = false): Promise<OidcDiscoveryDocument> {
  const normalized = normalizeIssuer(issuer);
  const cached = discoveryCache.get(normalized);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.doc;
  }

  const discoveryUrl = `${normalized}/.well-known/openid-configuration`;
  const raw = await fetchOidcDiscoveryDocument(discoveryUrl);

  if (!raw || !raw.authorization_endpoint || !raw.token_endpoint || !raw.jwks_uri) {
    throw new OAuthFlowError(
      'provider_misconfigured',
      `Could not discover the OIDC provider configuration at "${discoveryUrl}". Check the Issuer URL.`,
      400
    );
  }

  const doc: OidcDiscoveryDocument = {
    issuer: (raw.issuer as string) || normalized,
    authorization_endpoint: raw.authorization_endpoint as string,
    token_endpoint: raw.token_endpoint as string,
    jwks_uri: raw.jwks_uri as string
  };

  discoveryCache.set(normalized, { doc, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
  return doc;
}

// ---------------------------------------------------------------------------
// JWKS-based ID token verification (`jose`). The JWKS document itself is
// fetched with axios (not jose's own remote-fetch helper) so it mocks
// exactly like every other network call in this codebase's test suite, and
// wrapped in `jose.createLocalJWKSet` for verification. Cached per
// `jwks_uri` with the same reasoning as the discovery cache; a verification
// failure specifically due to an unrecognized `kid` (key rotation) triggers
// one forced refetch-and-retry, so a provider rotating its signing key never
// requires a server restart.
// ---------------------------------------------------------------------------

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, { jwks: ReturnType<typeof createLocalJWKSet>; expiresAt: number }>();

async function getJwks(jwksUri: string, forceRefresh = false): Promise<ReturnType<typeof createLocalJWKSet>> {
  const cached = jwksCache.get(jwksUri);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.jwks;
  }

  const response = await axios.get(jwksUri, { timeout: 8000 });
  const jwks = createLocalJWKSet(response.data);
  jwksCache.set(jwksUri, { jwks, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
  return jwks;
}

/** Exposed for tests only — clears both in-memory caches. */
export function __resetOidcCachesForTests(): void {
  discoveryCache.clear();
  jwksCache.clear();
}

/**
 * Signature + standard-claims verification (exp/nbf/iat via jose, issuer +
 * audience via the passed options). Does NOT check the OIDC `nonce` claim —
 * that's caller-specific (compared against a server-issued value), see
 * `verifyIdToken` below.
 */
async function verifyAndDecodeIdToken(
  idToken: string,
  discovery: OidcDiscoveryDocument,
  clientId: string
): Promise<JWTPayload> {
  let jwks = await getJwks(discovery.jwks_uri);

  try {
    const { payload } = await jwtVerify(idToken, jwks, { issuer: discovery.issuer, audience: clientId });
    return payload;
  } catch (error) {
    if (error instanceof joseErrors.JWKSNoMatchingKey) {
      // Possible key rotation on the provider's side — refetch once and retry
      // before giving up.
      jwks = await getJwks(discovery.jwks_uri, true);
      const { payload } = await jwtVerify(idToken, jwks, { issuer: discovery.issuer, audience: clientId });
      return payload;
    }
    throw error;
  }
}

export const oidcService = {
  /**
   * Get generic OIDC configuration (customer-specific if `customerId` is
   * given and enabled, else global). Unlike Google/Cognito, there is no
   * legacy environment-variable fallback — this is a brand-new provider with
   * no pre-existing env-var-only deployments to preserve compatibility with.
   */
  async getOidcConfig(customerId?: string): Promise<OidcConfigResponse | null> {
    try {
      if (customerId) {
        const customerConfig = await prisma.customerIdentityProvider.findFirst({
          where: { customerId, type: PROVIDER_TYPE }
        });

        if (customerConfig && customerConfig.enabled) {
          const configData = decryptFields(
            customerConfig.config ? JSON.parse(customerConfig.config as string) : {},
            SENSITIVE_CONFIG_FIELDS
          );

          return {
            enabled: customerConfig.enabled,
            issuer: (configData.issuer as string) || '',
            clientId: (configData.clientId as string) || '',
            clientSecret: (configData.clientSecret as string) || '',
            redirectUri: (configData.redirectUri as string) || '',
            scope: (configData.scope as string) || 'openid email profile',
            isCustomerSpecific: true,
            jitMode: (configData.jitMode as JitMode) || 'legacy-first-customer'
          };
        }
      }

      const globalConfig = await prisma.identityProvider.findFirst({ where: { type: PROVIDER_TYPE } });

      if (globalConfig && globalConfig.enabled) {
        const configData = decryptFields(
          globalConfig.config ? JSON.parse(globalConfig.config as string) : {},
          SENSITIVE_CONFIG_FIELDS
        );

        return {
          enabled: globalConfig.enabled,
          issuer: (configData.issuer as string) || '',
          clientId: (configData.clientId as string) || '',
          clientSecret: (configData.clientSecret as string) || '',
          redirectUri: (configData.redirectUri as string) || '',
          scope: (configData.scope as string) || 'openid email profile',
          isCustomerSpecific: false,
          jitMode: (configData.jitMode as JitMode) || 'legacy-first-customer'
        };
      }

      return null;
    } catch (error) {
      loggerService.error('Error getting OIDC config:', error);
      return null;
    }
  },

  /** Save generic OIDC configuration. `clientSecret` is encrypted at rest. */
  async saveOidcConfig(data: OidcConfigResponse, customerId?: string): Promise<boolean> {
    try {
      const existingConfigRow = customerId
        ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: PROVIDER_TYPE } })
        : await prisma.identityProvider.findFirst({ where: { type: PROVIDER_TYPE } });

      const previousJitMode = existingConfigRow
        ? ((JSON.parse((existingConfigRow.config as string) || '{}').jitMode as JitMode) || 'legacy-first-customer')
        : undefined;

      const configData = encryptFields(
        {
          issuer: data.issuer,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scope: data.scope,
          // New configs default to domain-match; an update that doesn't
          // specify jitMode preserves whatever the config already had, so
          // saving other fields never silently changes JIT behavior.
          jitMode: data.jitMode || previousJitMode || 'domain-match'
        },
        SENSITIVE_CONFIG_FIELDS
      );

      if (customerId) {
        if (existingConfigRow) {
          await prisma.customerIdentityProvider.update({
            where: { id: existingConfigRow.id },
            data: { enabled: data.enabled, config: JSON.stringify(configData) }
          });
        } else {
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
        if (existingConfigRow) {
          await prisma.identityProvider.update({
            where: { id: existingConfigRow.id },
            data: { enabled: data.enabled, config: JSON.stringify(configData) }
          });
        } else {
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
      loggerService.error('Error saving OIDC config:', error);
      return false;
    }
  },

  /**
   * Read the previously-stored clientSecret for the EXACT save target (the
   * customer-specific row when `customerId` is given, else the global row)
   * — mirrors oauth.utils.ts's `getStoredClientSecret` / cognito.service.ts's
   * `getStoredCognitoSecrets`, kept local since this provider owns its own
   * config get/save logic.
   */
  async getStoredOidcClientSecret(customerId?: string): Promise<string | undefined> {
    try {
      const row = customerId
        ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: PROVIDER_TYPE } })
        : await prisma.identityProvider.findFirst({ where: { type: PROVIDER_TYPE } });

      if (!row?.config) return undefined;
      const decoded = decryptFields(JSON.parse(row.config as string), SENSITIVE_CONFIG_FIELDS);
      return (decoded.clientSecret as string) || undefined;
    } catch (error) {
      loggerService.error('Error reading stored OIDC client secret:', error);
      return undefined;
    }
  },

  /** Reset customer-specific OIDC configuration to use the global configuration. */
  async resetOidcConfig(customerId: string): Promise<boolean> {
    try {
      await prisma.customerIdentityProvider.deleteMany({ where: { customerId, type: PROVIDER_TYPE } });
      return true;
    } catch (error) {
      loggerService.error('Error resetting OIDC configuration:', error);
      return false;
    }
  },

  /**
   * Generate the OIDC authorization URL from the discovered
   * `authorization_endpoint`. Mints server-side state + nonce, same two-hop
   * binding as google/microsoft/cognito (see oauth-state.store.ts).
   */
  async getAuthUrl(customerId?: string): Promise<OidcAuthUrlResponse> {
    const oidcConfig = await this.getOidcConfig(customerId);

    if (!oidcConfig || !oidcConfig.enabled) {
      throw new OAuthFlowError('provider_disabled', 'Generic OIDC sign-in is not configured or is disabled.', 400);
    }
    if (!oidcConfig.issuer) {
      throw new OAuthFlowError(
        'provider_misconfigured',
        'Generic OIDC is missing its Issuer URL. Configure it in Identity Providers before enabling sign-in.',
        400
      );
    }
    if (!oidcConfig.redirectUri) {
      throw new OAuthFlowError(
        'provider_misconfigured',
        'Generic OIDC is missing its redirect URI. Configure it in Identity Providers before enabling sign-in.',
        400
      );
    }

    const discovery = await discoverOidcConfiguration(oidcConfig.issuer);
    const { state, nonce } = await createOAuthFlowState(PROVIDER_TYPE, customerId);

    const authUrl = `${discovery.authorization_endpoint}?${new URLSearchParams({
      client_id: oidcConfig.clientId,
      response_type: 'code',
      scope: oidcConfig.scope || 'openid email profile',
      redirect_uri: oidcConfig.redirectUri,
      state,
      nonce
    }).toString()}`;

    return { authUrl, state };
  },

  /**
   * Exchange the authorization code for tokens at the discovered
   * `token_endpoint`. Validates the server-side `state` before talking to
   * the provider (rejects a missing/replayed/unknown state before any
   * network call is made).
   */
  async handleCallback(data: OidcCallbackRequest, customerId?: string) {
    const stateResult = await consumeOAuthState(data.state, PROVIDER_TYPE);
    if (!stateResult) {
      throw new OAuthFlowError(
        'invalid_state',
        'Your sign-in session could not be verified (it may have expired or already been used). Please try signing in again.',
        400
      );
    }

    const oidcConfig = await this.getOidcConfig(customerId ?? stateResult.customerId);

    if (!oidcConfig || !oidcConfig.enabled) {
      throw new OAuthFlowError('provider_disabled', 'Generic OIDC sign-in is not configured or is disabled.', 400);
    }
    if (!oidcConfig.issuer) {
      throw new OAuthFlowError(
        'provider_misconfigured',
        'Generic OIDC is missing its Issuer URL. Configure it in Identity Providers before enabling sign-in.',
        400
      );
    }

    const discovery = await discoverOidcConfiguration(oidcConfig.issuer);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: oidcConfig.clientId,
      code: data.code,
      redirect_uri: data.redirectUri
    });
    if (oidcConfig.clientSecret) {
      body.set('client_secret', oidcConfig.clientSecret);
    }

    try {
      const response = await axios.post(discovery.token_endpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      return {
        idToken: response.data.id_token,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        // Handed back to the client so it can be forwarded to /token-exchange,
        // which consumes it (one-time) — see exchangeTokensForJWT.
        nonce: stateResult.nonce
      };
    } catch (error) {
      loggerService.error('Error exchanging OIDC authorization code:', error);
      throw new OAuthFlowError('oauth_error', 'Failed to exchange the authorization code with the OIDC provider.', 400);
    }
  },

  /**
   * Verify an ID token against the configured issuer's real JWKS and return
   * the OIDC user info it carries. When `expectedNonce` is supplied, the
   * token's own `nonce` claim must match it — standard OIDC replay/
   * substitution protection, in addition to the server-side nonce
   * consumption `exchangeTokensForJWT` performs.
   */
  async verifyIdToken(idToken: string, customerId?: string, expectedNonce?: string): Promise<OAuthUserInfo> {
    const oidcConfig = await this.getOidcConfig(customerId);

    if (!oidcConfig || !oidcConfig.enabled) {
      throw new OAuthFlowError('provider_disabled', 'Generic OIDC sign-in is not configured or is disabled.', 400);
    }

    const discovery = await discoverOidcConfiguration(oidcConfig.issuer);

    let payload: JWTPayload;
    try {
      payload = await verifyAndDecodeIdToken(idToken, discovery, oidcConfig.clientId);
    } catch (error) {
      loggerService.warn('Rejected OIDC ID token that failed signature/claims verification:', error);
      throw new OAuthFlowError('invalid_token', 'Invalid OIDC ID token: signature verification failed', 401);
    }

    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new OAuthFlowError('nonce_mismatch', 'Sign-in verification failed. Please try signing in again.', 400);
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!email) {
      throw new Error('Email not found in token');
    }

    return {
      email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      firstName: typeof payload.given_name === 'string' ? payload.given_name : undefined,
      lastName: typeof payload.family_name === 'string' ? payload.family_name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      emailVerified: Boolean(payload.email_verified),
      providerId: typeof payload.sub === 'string' ? payload.sub : ''
    };
  },

  /**
   * Exchange OIDC tokens for application JWT tokens.
   *
   * `customerId` is essentially never populated by the controller for this
   * call — it's a public, pre-authentication endpoint, so there is no
   * verified JWT to read it from. Signature verification and `jitMode`
   * resolution therefore need the tenant this flow was actually bound to at
   * `/auth-url` time (I3 per-tenant config resolution), which only the
   * `nonce` minted then — and returned by `/handle-callback` — still
   * carries. That nonce is consumed HERE (authoritatively, one-time) so its
   * bound `customerId` is available BEFORE verification needs it (mirrors
   * cognito.service.ts's `exchangeCognitoTokens`, which resolves
   * `nonceCustomerId` the same way for the identical reason — Google/
   * Microsoft's shared-helper path does not do this, which means a
   * customer-specific Google/Microsoft config is never actually honored by
   * their own token-exchange call; a real, separate, pre-existing gap
   * outside this task's scope). `exchangeTokensForJWT` is still called for
   * its gate-parity checks and JIT provisioning, but with `nonce` omitted —
   * consuming it a second time would always fail, since it's one-time-use.
   */
  async exchangeOidcTokens(data: OidcTokenExchangeRequest, customerId?: string) {
    try {
      let resolvedCustomerId = customerId;

      if (data.nonce) {
        const nonceRecord = await consumeOAuthNonce(data.nonce, PROVIDER_TYPE);
        if (!nonceRecord) {
          throw new OAuthFlowError(
            'invalid_nonce',
            'This sign-in link has expired or was already used. Please sign in again.',
            400
          );
        }
        resolvedCustomerId = customerId ?? nonceRecord.customerId;
      }

      // The token's own `nonce` claim is still checked against `data.nonce`
      // inside verifyIdToken (defense-in-depth) — the nonce value itself
      // was already authoritatively validated as server-issued above.
      const userInfo = await this.verifyIdToken(data.idToken, resolvedCustomerId, data.nonce);

      if (!userInfo.email || !userInfo.providerId) {
        throw new Error('Email or provider ID not found in token');
      }

      const oidcConfig = await this.getOidcConfig(resolvedCustomerId);

      return await exchangeTokensForJWT(userInfo, PROVIDER_TYPE, undefined, oidcConfig?.jitMode);
    } catch (error) {
      loggerService.error('Error exchanging OIDC tokens:', error);
      throw error;
    }
  },

  /**
   * Validate a generic OIDC configuration (submitted values, not what's
   * saved) without requiring a real login: (1) does the issuer's discovery
   * document resolve, (2) does the discovered token endpoint accept the
   * Client ID / Client Secret pair. `forceRefresh` on the discovery lookup
   * so an admin actively testing a just-edited issuer never sees a stale
   * cached result.
   */
  async testConnection(data: {
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  }): Promise<TestConnectionResult> {
    if (!data.issuer || !data.clientId) {
      return { success: false, message: 'Issuer and Client ID are required.' };
    }

    let discovery: OidcDiscoveryDocument;
    try {
      discovery = await discoverOidcConfiguration(data.issuer, true);
    } catch (error) {
      const message =
        error instanceof OAuthFlowError
          ? error.message
          : `Could not discover the OIDC provider configuration at "${data.issuer}". Check the Issuer URL.`;
      return { success: false, message };
    }

    const details: string[] = [`OIDC discovery succeeded (issuer: ${discovery.issuer}).`];

    const probe = await probeOAuthClientCredentials(discovery.token_endpoint, {
      grant_type: 'authorization_code',
      client_id: data.clientId,
      client_secret: data.clientSecret || '',
      code: 'veltrix-test-connection-probe',
      redirect_uri: data.redirectUri || 'https://veltrix.invalid/oauth/callback'
    });

    if (!probe.reachable) {
      return {
        success: false,
        message: `Discovery succeeded, but the token endpoint is not reachable: ${probe.errorMessage}`,
        details
      };
    }

    if (!probe.credentialsAccepted) {
      return {
        success: false,
        message: `The OIDC provider rejected the Client ID / Client Secret pair (${probe.providerErrorCode}). Double-check both values.`,
        details
      };
    }

    details.push('Token endpoint is reachable and the Client ID / Client Secret pair was accepted.');
    return { success: true, message: 'The OIDC provider configuration looks good.', details };
  }
};

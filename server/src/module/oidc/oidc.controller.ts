import { FastifyRequest, FastifyReply } from 'fastify';
import { oidcService } from './oidc.service';
import { OidcTokenExchangeRequest, OidcConfigResponse, OidcCallbackRequest } from './oidc.schema';
import { loggerService } from '../logger/logger.service';
import { tryResolveVerifiedCustomerId } from '../../middlewares/authMiddleware';
import {
  toOAuthErrorResponse,
  resolveCustomerIdFromHint,
  validateOidcConfig,
  redactSecret,
  preserveSecretOnOmit
} from '../oauth/oauth.utils';

export const oidcController = {
  /**
   * Get generic OIDC configuration. Deliberately PUBLIC (no verifyToken) —
   * pre-login pages (SignupPage, LoginPage's SSO buttons) poll this to
   * decide whether to render OIDC sign-in. Every field returned besides the
   * secret (issuer, clientId, redirectUri, scope, ...) is already
   * necessarily public: it's embedded in the browser-visible OIDC authorize
   * URL during the real login flow. `clientSecret` is NEVER returned in
   * plaintext — only a presence flag (`hasClientSecret`) the settings UI
   * uses to render "•••• configured".
   *
   * Tenant scope resolution, in priority order: (1) an optional
   * `?emailHint=`/`?domainHint=` query param, resolved via the same
   * `resolveCustomerIdFromHint` every other provider's `/auth-url` already
   * uses (I3) — this is what lets LoginPage's pre-login "Continue with SSO"
   * button become visible for a CUSTOMER-SPECIFIC-only config once the
   * visitor has typed an email at that tenant's domain, without ever
   * requiring a platform-wide global config to exist; (2) a VERIFIED JWT
   * when one is present (`tryResolveVerifiedCustomerId`) — e.g. the admin
   * settings page, already authenticated. Never a client-supplied header.
   */
  async getOidcConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { emailHint?: string; domainHint?: string } | undefined;
      const hintCustomerId = await resolveCustomerIdFromHint(query?.emailHint || query?.domainHint);
      const customerId = hintCustomerId || (await tryResolveVerifiedCustomerId(request));

      loggerService.info('Getting OIDC config', { customerId: customerId || 'global' });

      const config = await oidcService.getOidcConfig(customerId);

      if (!config) {
        return reply.send({
          enabled: false,
          issuer: '',
          clientId: '',
          clientSecret: '',
          hasClientSecret: false,
          redirectUri: '',
          scope: '',
          isCustomerSpecific: false
        });
      }

      const secret = redactSecret(config.clientSecret);
      return reply.send({ ...config, clientSecret: secret.value, hasClientSecret: secret.present });
    } catch (error) {
      loggerService.error('Error getting OIDC configuration:', error);
      return reply.send({
        enabled: false,
        issuer: '',
        clientId: '',
        clientSecret: '',
        hasClientSecret: false,
        redirectUri: '',
        scope: '',
        isCustomerSpecific: false
      });
    }
  },

  /**
   * Save generic OIDC configuration. Tenant scope comes from `request.user`
   * (set by `verifyToken` off the verified JWT bearer token) — NOT
   * `request.headers['x-customer-id']` — the request explicitly asked for
   * this module to resolve scope from the verified JWT rather than headers.
   * Preserve-on-omit: an empty/omitted clientSecret keeps whatever is
   * already stored instead of wiping it.
   */
  async saveOidcConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = request.body as OidcConfigResponse;

      if (!config.clientId || !config.issuer) {
        return reply.status(400).send({ error: 'Issuer and Client ID are required' });
      }

      const customerId = request.user?.customerId;
      const scopeCustomerId = config.isCustomerSpecific ? customerId : undefined;

      const existingSecret = await oidcService.getStoredOidcClientSecret(scopeCustomerId);
      const resolvedSecret = preserveSecretOnOmit(config.clientSecret, existingSecret);

      if (!resolvedSecret) {
        return reply.status(400).send({ error: 'Client Secret is required' });
      }

      const resolvedConfig: OidcConfigResponse = { ...config, clientSecret: resolvedSecret };

      const validation = validateOidcConfig(resolvedConfig);
      if (!validation.valid) {
        return reply.status(400).send({ error: validation.errors.join(' ') });
      }

      const result = await oidcService.saveOidcConfig(resolvedConfig, scopeCustomerId);

      if (!result) {
        return reply.status(500).send({ error: 'Failed to save OIDC configuration' });
      }

      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error saving OIDC configuration:', error);
      return reply.status(500).send({ error: 'Failed to save OIDC configuration' });
    }
  },

  /** Reset customer-specific OIDC configuration to use the global configuration. */
  async resetOidcConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = request.user?.customerId;

      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }

      const result = await oidcService.resetOidcConfig(customerId);

      if (!result) {
        return reply.status(500).send({ error: 'Failed to reset OIDC configuration' });
      }

      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error resetting OIDC configuration:', error);
      return reply.status(500).send({ error: 'Failed to reset OIDC configuration' });
    }
  },

  /**
   * Get the OIDC authorization URL. An optional `?emailHint=`/`?domainHint=`
   * resolves the requesting tenant's own customer-specific config instead of
   * always falling back to the global config (I3 pattern, shared across
   * every provider).
   */
  async getAuthUrl(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { emailHint?: string; domainHint?: string } | undefined;
      const hintCustomerId = await resolveCustomerIdFromHint(query?.emailHint || query?.domainHint);
      const customerId = hintCustomerId || request.user?.customerId;

      const result = await oidcService.getAuthUrl(customerId);
      return reply.send(result);
    } catch (error) {
      loggerService.error('Error getting OIDC auth URL:', error);
      const { status, body } = toOAuthErrorResponse(error);
      return reply.status(status).send(body);
    }
  },

  /** Handle the OIDC callback — exchange the authorization code for tokens. */
  async handleCallback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as OidcCallbackRequest;
      const { code, redirectUri, state } = body;

      if (!code || !redirectUri) {
        return reply.status(400).send({ error: 'Authorization code and redirect URI are required', code: 'missing_params' });
      }
      if (!state) {
        return reply.status(400).send({ error: 'Missing sign-in state. Please try signing in again.', code: 'invalid_state' });
      }

      const customerId = request.user?.customerId;
      const result = await oidcService.handleCallback({ code, redirectUri, state }, customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error handling OIDC callback:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },

  /** Exchange OIDC tokens for an application JWT. */
  async exchangeOidcTokens(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as OidcTokenExchangeRequest;
      const { idToken, accessToken, nonce } = body;

      if (!idToken || !accessToken) {
        return reply.status(400).send({ error: 'ID token and access token are required', code: 'missing_params' });
      }

      const customerId = request.user?.customerId;
      const result = await oidcService.exchangeOidcTokens({ idToken, accessToken, nonce }, customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error exchanging OIDC tokens:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },

  /**
   * Test a generic OIDC configuration (submitted values, not what's saved)
   * without requiring a real login. Preserve-on-omit: an empty clientSecret
   * here tests against the currently EFFECTIVE stored secret (customer-
   * specific if one exists, else global) instead of a blank value that
   * would always fail.
   */
  async testConnection(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { issuer?: string; clientId?: string; clientSecret?: string; redirectUri?: string };
      const customerId = request.user?.customerId;
      const existing = await oidcService.getOidcConfig(customerId);
      const resolvedSecret = preserveSecretOnOmit(body.clientSecret, existing?.clientSecret);

      const result = await oidcService.testConnection({ ...body, clientSecret: resolvedSecret });
      return reply.send(result);
    } catch (error) {
      loggerService.error('Error testing OIDC connection:', error);
      return reply.status(500).send({ success: false, message: 'Failed to test the OIDC configuration.' });
    }
  }
};

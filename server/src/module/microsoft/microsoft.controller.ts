import { FastifyRequest, FastifyReply } from 'fastify';
import { microsoftService } from './microsoft.service';
import { MicrosoftTokenExchangeRequest, MicrosoftConfigResponse, MicrosoftCallbackRequest } from './microsoft.schema';
import { loggerService } from '../logger/logger.service';
import { tryResolveVerifiedCustomerId } from '../../middlewares/authMiddleware';
import {
  toOAuthErrorResponse,
  resolveCustomerIdFromHint,
  validateMicrosoftConfig,
  redactSecret,
  preserveSecretOnOmit,
  getStoredClientSecret
} from '../oauth/oauth.utils';

const PROVIDER_TYPE = 'MICROSOFT';

export const microsoftController = {
  /**
   * Get Microsoft OAuth configuration. Deliberately PUBLIC (no verifyToken)
   * — pre-login pages (SignupPage, LoginPage's SSO buttons) poll this to
   * decide whether to render Microsoft sign-in, and every field it returns
   * besides the secret (clientId, tenantId, redirectUri, scope, ...) is
   * already necessarily public: it's embedded in the browser-visible OAuth
   * authorize URL during the real login flow.
   *
   * URGENT security fix (2026-07-11): `clientSecret` is now NEVER returned
   * in plaintext to ANYONE — only a presence flag (`hasClientSecret`) the
   * settings UI uses to render "•••• configured". The tenant scope is
   * resolved from a VERIFIED JWT when one is present (tryResolveVerifiedCustomerId)
   * rather than trusting the client-supplied X-Customer-ID header, which
   * closes the other half of the original bug: an anonymous caller could
   * pass an arbitrary X-Customer-ID to target any tenant's config.
   */
  async getMicrosoftConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = await tryResolveVerifiedCustomerId(request);

      loggerService.info('Getting Microsoft config', { customerId: customerId || 'global' });

      // Get Microsoft configuration (customer-specific if customerId is provided)
      const config = await microsoftService.getMicrosoftConfig(customerId);

      if (!config) {
        loggerService.warn('No Microsoft configuration found, returning disabled config');
        // Return a disabled config instead of 404 to allow the app to function
        return reply.send({
          enabled: false,
          clientId: '',
          clientSecret: '',
          hasClientSecret: false,
          tenantId: 'common',
          redirectUri: '',
          scope: '',
          authority: '',
          isCustomerSpecific: false
        });
      }

      const secret = redactSecret(config.clientSecret);
      return reply.send({ ...config, clientSecret: secret.value, hasClientSecret: secret.present });
    } catch (error) {
      loggerService.error('Error getting Microsoft configuration:', error);
      // Return disabled config instead of 500 to allow the app to continue
      return reply.send({
        enabled: false,
        clientId: '',
        clientSecret: '',
        hasClientSecret: false,
        tenantId: 'common',
        redirectUri: '',
        scope: '',
        authority: '',
        isCustomerSpecific: false
      });
    }
  },

  /**
   * Save Microsoft OAuth configuration. Preserve-on-omit (2026-07-11): the
   * settings UI never resends a real secret verbatim (it only ever sees the
   * redacted value from getMicrosoftConfig above) — an empty/omitted
   * clientSecret keeps whatever is already stored instead of wiping it.
   */
  async saveMicrosoftConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = request.body as MicrosoftConfigResponse;

      if (!config.clientId) {
        return reply.status(400).send({ error: 'Client ID is required' });
      }

      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      const scopeCustomerId = config.isCustomerSpecific ? customerId : undefined;

      const existingSecret = await getStoredClientSecret(PROVIDER_TYPE, scopeCustomerId);
      const resolvedSecret = preserveSecretOnOmit(config.clientSecret, existingSecret);

      if (!resolvedSecret) {
        return reply.status(400).send({ error: 'Client Secret is required' });
      }

      const resolvedConfig: MicrosoftConfigResponse = { ...config, clientSecret: resolvedSecret };

      // I4: validate beyond mere presence.
      const validation = validateMicrosoftConfig(resolvedConfig);
      if (!validation.valid) {
        return reply.status(400).send({ error: validation.errors.join(' ') });
      }

      // If isCustomerSpecific is true, save as customer-specific configuration
      const result = await microsoftService.saveMicrosoftConfig(resolvedConfig, scopeCustomerId);

      if (!result) {
        return reply.status(500).send({ error: 'Failed to save Microsoft configuration' });
      }

      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error saving Microsoft configuration:', error);
      return reply.status(500).send({ error: 'Failed to save Microsoft configuration' });
    }
  },

  /**
   * Reset customer-specific Microsoft configuration
   */
  async resetMicrosoftConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = request.headers['x-customer-id'] as string;

      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }

      const result = await microsoftService.resetMicrosoftConfig(customerId);

      if (!result) {
        return reply.status(500).send({ error: 'Failed to reset Microsoft configuration' });
      }

      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error resetting Microsoft configuration:', error);
      return reply.status(500).send({ error: 'Failed to reset Microsoft configuration' });
    }
  },

  /**
   * Get Microsoft OAuth authorization URL. I3: an optional `?emailHint=`
   * (or `?domainHint=`) query param resolves the requesting tenant's own
   * customer-specific config instead of always falling back to global.
   */
  async getAuthUrl(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { emailHint?: string; domainHint?: string } | undefined;
      const hintCustomerId = await resolveCustomerIdFromHint(query?.emailHint || query?.domainHint);
      const customerId = hintCustomerId || (request.headers['x-customer-id'] as string | undefined);

      const result = await microsoftService.getAuthUrl(customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error getting Microsoft auth URL:', error);
      const { status, body } = toOAuthErrorResponse(error);
      return reply.status(status).send(body);
    }
  },

  /**
   * Handle Microsoft OAuth callback
   */
  async handleCallback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as MicrosoftCallbackRequest;
      const { code, redirectUri, state } = body;

      if (!code || !redirectUri) {
        return reply.status(400).send({ error: 'Authorization code and redirect URI are required', code: 'missing_params' });
      }

      if (!state) {
        return reply.status(400).send({ error: 'Missing sign-in state. Please try signing in again.', code: 'invalid_state' });
      }

      const customerId = request.headers['x-customer-id'] as string | undefined;

      const result = await microsoftService.handleCallback({ code, redirectUri, state }, customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error handling Microsoft callback:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },

  /**
   * Exchange Microsoft tokens for application JWT
   */
  async exchangeMicrosoftTokens(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as MicrosoftTokenExchangeRequest;
      const { idToken, accessToken, nonce } = body;

      if (!idToken || !accessToken) {
        return reply.status(400).send({ error: 'ID token and access token are required', code: 'missing_params' });
      }

      const customerId = request.headers['x-customer-id'] as string | undefined;

      const result = await microsoftService.exchangeMicrosoftTokens({ idToken, accessToken, nonce }, customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error exchanging Microsoft tokens:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },

  /**
   * I4: test a Microsoft/Azure AD OAuth configuration (submitted values,
   * not what's saved) without requiring a real login. Preserve-on-omit
   * (2026-07-11): the settings UI never resends a real secret verbatim
   * unless the admin clicked "Replace secret" — an empty clientSecret here
   * tests against the currently EFFECTIVE stored secret (customer-specific
   * if one exists, else global) instead of a blank value that would always
   * fail.
   */
  async testConnection(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { clientId?: string; clientSecret?: string; tenantId?: string; redirectUri?: string };
      const customerId = request.headers['x-customer-id'] as string | undefined;
      const existing = await microsoftService.getMicrosoftConfig(customerId);
      const resolvedSecret = preserveSecretOnOmit(body.clientSecret, existing?.clientSecret);

      const result = await microsoftService.testConnection({ ...body, clientSecret: resolvedSecret });
      return reply.send(result);
    } catch (error) {
      loggerService.error('Error testing Microsoft connection:', error);
      return reply.status(500).send({ success: false, message: 'Failed to test the Microsoft configuration.' });
    }
  }
};

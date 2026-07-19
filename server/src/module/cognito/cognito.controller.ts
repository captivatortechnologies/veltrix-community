import { FastifyRequest, FastifyReply } from 'fastify';
import { cognitoService } from './cognito.service';
import { CognitoTokenExchangeRequest, CognitoConfigResponse, CognitoCallbackRequest } from './cognito.schema';
import { loggerService } from '../../module/logger/logger.service';
import { tryResolveVerifiedCustomerId } from '../../middlewares/authMiddleware';
import { toOAuthErrorResponse, resolveCustomerIdFromHint, validateCognitoConfig, redactSecret, preserveSecretOnOmit } from '../oauth/oauth.utils';

export const cognitoController = {
  /**
   * Get Cognito configuration. Deliberately PUBLIC (no verifyToken) —
   * pre-login pages (SignupPage, LoginPage's SSO buttons/hosted-UI redirect
   * builder) poll this to decide whether to render Cognito sign-in, and
   * every field it returns besides the secrets (userPoolId, clientId,
   * redirectUri, logoutUri, scope, domain, ...) is already necessarily
   * public: it's embedded in the browser-visible Cognito Hosted UI
   * authorize URL during the real login flow.
   *
   * URGENT security fix (2026-07-11): `clientSecret` AND `awsSecretAccessKey`
   * are now NEVER returned in plaintext to ANYONE — only presence flags
   * (`hasClientSecret`/`hasAwsSecretAccessKey`) the settings UI uses to
   * render "•••• configured". `awsAccessKeyId` is a non-secret identifier
   * (like clientId) and is returned as-is. The tenant scope is resolved
   * from a VERIFIED JWT when one is present (tryResolveVerifiedCustomerId)
   * rather than trusting the client-supplied X-Customer-ID header, which
   * closes the other half of the original bug: an anonymous caller could
   * pass an arbitrary X-Customer-ID to target any tenant's config.
   */
  async getCognitoConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const customerId = await tryResolveVerifiedCustomerId(request);

      loggerService.info('Getting Cognito config', { customerId: customerId || 'global' });

      // Get Cognito configuration (customer-specific if customerId is provided)
      const config = await cognitoService.getCognitoConfig(customerId);

      if (!config) {
        loggerService.warn('No Cognito configuration found, returning disabled config');
        // Return a disabled config instead of 404 to allow the app to function
        return reply.send({
          enabled: false,
          userPoolId: '',
          userPoolRegion: 'us-east-1',
          clientId: '',
          clientSecret: '',
          hasClientSecret: false,
          redirectUri: '',
          logoutUri: '',
          scope: '',
          isCustomerSpecific: false,
          awsAccessKeyId: '',
          awsSecretAccessKey: '',
          hasAwsSecretAccessKey: false
        });
      }

      const clientSecret = redactSecret(config.clientSecret);
      const awsSecretAccessKey = redactSecret(config.awsSecretAccessKey);
      return reply.send({
        ...config,
        clientSecret: clientSecret.value,
        hasClientSecret: clientSecret.present,
        awsSecretAccessKey: awsSecretAccessKey.value,
        hasAwsSecretAccessKey: awsSecretAccessKey.present
      });
    } catch (error) {
      loggerService.error('Error getting Cognito configuration:', error);
      // Return disabled config instead of 500 to allow the app to continue
      return reply.send({
        enabled: false,
        userPoolId: '',
        userPoolRegion: 'us-east-1',
        clientId: '',
        clientSecret: '',
        hasClientSecret: false,
        redirectUri: '',
        logoutUri: '',
        scope: '',
        isCustomerSpecific: false,
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        hasAwsSecretAccessKey: false
      });
    }
  },

  /**
   * Save Cognito configuration. Preserve-on-omit (2026-07-11): the settings
   * UI never resends a real secret verbatim (it only ever sees the redacted
   * values from getCognitoConfig above) — an empty/omitted
   * clientSecret/awsSecretAccessKey keeps whatever is already stored
   * instead of wiping it.
   */
  async saveCognitoConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = request.body as CognitoConfigResponse;

      if (!config.userPoolId || !config.clientId) {
        return reply.status(400).send({ error: 'User Pool ID and Client ID are required' });
      }

      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      const scopeCustomerId = config.isCustomerSpecific ? customerId : undefined;

      const existing = await cognitoService.getStoredCognitoSecrets(scopeCustomerId);
      const resolvedClientSecret = preserveSecretOnOmit(config.clientSecret, existing.clientSecret);
      const resolvedAwsSecretAccessKey = preserveSecretOnOmit(config.awsSecretAccessKey, existing.awsSecretAccessKey);

      if (!resolvedClientSecret) {
        return reply.status(400).send({ error: 'Client Secret is required' });
      }

      const resolvedConfig: CognitoConfigResponse = {
        ...config,
        clientSecret: resolvedClientSecret,
        awsSecretAccessKey: resolvedAwsSecretAccessKey
      };

      // I4: validate beyond mere presence — a malformed User Pool ID,
      // region, or Hosted UI domain used to be silently accepted and only
      // surface as a confusing failure at login time.
      const validation = validateCognitoConfig(resolvedConfig);
      if (!validation.valid) {
        return reply.status(400).send({ error: validation.errors.join(' ') });
      }

      // If isCustomerSpecific is true, save as customer-specific configuration
      const result = await cognitoService.saveCognitoConfig(resolvedConfig, scopeCustomerId);

      if (!result) {
        return reply.status(500).send({ error: 'Failed to save Cognito configuration' });
      }

      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error saving Cognito configuration:', error);
      return reply.status(500).send({ error: 'Failed to save Cognito configuration' });
    }
  },
  
  // Exchange Cognito tokens for a JWT token
  async exchangeCognitoTokens(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as CognitoTokenExchangeRequest;
      const { idToken, accessToken, nonce } = body;

      if (!idToken || !accessToken) {
        return reply.status(400).send({ error: 'ID token and access token are required', code: 'missing_params' });
      }

      const result = await cognitoService.exchangeCognitoTokens({ idToken, accessToken, nonce });

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error exchanging Cognito tokens:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },

  /**
   * I4: test an AWS Cognito configuration (submitted values, not what's
   * saved) without requiring a real login. Preserve-on-omit (2026-07-11):
   * the settings UI never resends a real secret verbatim unless the admin
   * clicked "Replace secret" — an empty clientSecret here tests against the
   * currently EFFECTIVE stored secret (customer-specific if one exists,
   * else global) instead of a blank value that would always fail.
   */
  async testConnection(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        userPoolId?: string;
        userPoolRegion?: string;
        clientId?: string;
        clientSecret?: string;
        domain?: string;
      };
      const customerId = request.headers['x-customer-id'] as string | undefined;
      const existing = await cognitoService.getCognitoConfig(customerId);
      const resolvedSecret = preserveSecretOnOmit(body.clientSecret, existing?.clientSecret);

      const result = await cognitoService.testConnection({ ...body, clientSecret: resolvedSecret });
      return reply.send(result);
    } catch (error) {
      loggerService.error('Error testing Cognito connection:', error);
      return reply.status(500).send({ success: false, message: 'Failed to test the AWS Cognito configuration.' });
    }
  },

  // Generate the AWS Cognito Hosted UI authorization URL (I3 instant-on fix —
  // resolves domain/redirect from the actual per-tenant/global config
  // instead of a hardcoded value; mints server-side state + nonce, I1). An
  // optional `?emailHint=`/`?domainHint=` resolves the requesting tenant's
  // own customer-specific config.
  async getAuthUrl(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { emailHint?: string; domainHint?: string } | undefined;
      const hintCustomerId = await resolveCustomerIdFromHint(query?.emailHint || query?.domainHint);
      const customerId = hintCustomerId || (request.headers['x-customer-id'] as string | undefined);

      const result = await cognitoService.getAuthUrl(customerId);
      return reply.send(result);
    } catch (error) {
      loggerService.error('Error getting Cognito auth URL:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },
  
  // Create a user in Cognito
  async createCognitoUser(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      // Get user data from request body
      const userData = request.body as {
        name?: string;
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
        email: string;
        password?: string; // Make password optional
        roleId: number | string;
      };
      
      if ((!userData.firstName && !userData.lastName && !userData.name) || !userData.email) {
        return reply.status(400).send({ error: 'Name (first or last) and email are required' });
      }
      
      // Create user in Cognito
      const result = await cognitoService.createUserInCognito({
        ...userData,
        customerId
      });
      
      if (!result.success) {
        return reply.status(500).send({ error: result.error || 'Failed to create user in Cognito' });
      }
      
      return reply.send({
        success: true,
        cognitoUserId: result.cognitoUserId,
        dbUser: result.dbUser,
        dbSaveSuccess: result.dbSaveSuccess
      });
    } catch (error) {
      loggerService.error('Error creating user in Cognito:', error);
      return reply.status(500).send({ error: 'Failed to create user in Cognito' });
    }
  },
  
  // Update a user in Cognito
  async updateCognitoUser(request: FastifyRequest, reply: FastifyReply) {
    // This would be implemented if we need to update users in Cognito from our app
    return reply.status(501).send({ error: 'Not implemented' });
  },
  
  // Get all users from Cognito
  async getCognitoUsers(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      // Get users from Cognito
      const users = await cognitoService.getCognitoUsers(customerId);
      
      return reply.send(users);
    } catch (error) {
      loggerService.error('Error getting Cognito users:', error);
      return reply.status(500).send({ error: 'Failed to get Cognito users' });
    }
  },
  
  // Delete a user from Cognito
  async deleteCognitoUser(request: FastifyRequest, reply: FastifyReply) {
    // This would be implemented if we need to delete users from Cognito from our app
    return reply.status(501).send({ error: 'Not implemented' });
  },
  
  // Handle Cognito OAuth callback - exchange authorization code for tokens
  async handleCognitoCallback(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { code, redirectUri, state } = request.body as CognitoCallbackRequest;

      loggerService.info('Handling Cognito callback', {
        codePreview: code ? code.substring(0, 10) + '...' : 'undefined',
        redirectUri
      });

      if (!code || !redirectUri) {
        return reply.status(400).send({ error: 'Authorization code and redirect URI are required', code: 'missing_params' });
      }

      if (!state) {
        return reply.status(400).send({ error: 'Missing sign-in state. Please try signing in again.', code: 'invalid_state' });
      }

      const customerId = request.headers['x-customer-id'] as string | undefined;

      // Delegates to cognitoService.handleCallback, which validates `state`
      // (I1) and resolves the token endpoint from the configured Hosted UI
      // `domain` (I3 instant-on fix) instead of a hardcoded URL.
      const result = await cognitoService.handleCallback({ code, redirectUri, state }, customerId);

      return reply.send(result);
    } catch (error) {
      loggerService.error('Error handling Cognito callback:', error);
      const { status, body: errorBody } = toOAuthErrorResponse(error);
      return reply.status(status).send(errorBody);
    }
  },
  
  // Authenticate a user with Cognito
  async authenticateCognitoUser(request: FastifyRequest, reply: FastifyReply) {
    // This would be implemented if we need to authenticate users with Cognito directly
    // Instead, we're using the code exchange flow on the client side
    return reply.status(501).send({ error: 'Not implemented' });
  },
  
  // Reset customer-specific Cognito configuration to use global configuration
  async resetCognitoConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      // Delete customer-specific configuration
      const result = await cognitoService.resetCognitoConfig(customerId);
      
      if (!result) {
        return reply.status(500).send({ error: 'Failed to reset Cognito configuration' });
      }
      
      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error resetting Cognito configuration:', error);
      return reply.status(500).send({ error: 'Failed to reset Cognito configuration' });
    }
  },
  
  // Disable Cognito when another SSO option is selected
  async disableCognitoForSso(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Get customerId from request headers (set by authMiddleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      // Get SSO type from request body
      const { ssoType } = request.body as { ssoType: string };
      
      if (!ssoType) {
        return reply.status(400).send({ error: 'SSO type is required' });
      }
      
      // Disable Cognito and enable the selected SSO provider
      const result = await cognitoService.disableCognitoForSso(customerId, ssoType);
      
      if (!result) {
        return reply.status(500).send({ error: `Failed to disable Cognito for SSO type ${ssoType}` });
      }
      
      return reply.send({ success: true });
    } catch (error) {
      loggerService.error('Error disabling Cognito for SSO:', error);
      return reply.status(500).send({ error: 'Failed to disable Cognito for SSO' });
    }
  }
};

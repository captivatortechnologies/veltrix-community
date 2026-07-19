import { FastifyInstance } from 'fastify';
import { oidcController } from './oidc.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';
import { requireTierFeature } from '../../middlewares/tenant-isolation.middleware';

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    // Machine-readable failure reason — e.g. invalid_state, nonce_mismatch,
    // provider_disabled, provider_misconfigured, invalid_token, jit_disabled,
    // jit_domain_not_allowed, user_inactive, tenant_suspended — so the
    // client can render specific UI (see identityProviderTypes.ts's
    // describeSsoError, shared across every provider).
    code: { type: 'string' }
  }
};

const oidcConfigSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    issuer: { type: 'string' },
    clientId: { type: 'string' },
    // Always '' on the wire — the real secret is never returned.
    // hasClientSecret is the presence flag the settings UI renders as
    // "•••• configured".
    clientSecret: { type: 'string' },
    hasClientSecret: { type: 'boolean' },
    redirectUri: { type: 'string' },
    scope: { type: 'string' },
    isCustomerSpecific: { type: 'boolean' },
    jitMode: { type: 'string' }
  }
};

export default async function oidcRoutes(fastify: FastifyInstance) {
  console.log('Registering generic OIDC routes');

  // Get generic OIDC configuration. Deliberately public (unauthenticated) —
  // SignupPage/LoginPage poll this pre-login to decide whether to render a
  // "Continue with SSO" button. clientSecret is ALWAYS redacted regardless
  // of caller — every other field is already necessarily public (embedded
  // in the browser-visible OIDC authorize URL during the real login flow).
  fastify.get(
    '/',
    {
      schema: {
        tags: ['oidc'],
        summary: 'Get generic OIDC configuration',
        description: 'Returns the current generic OIDC configuration for authentication, with clientSecret always redacted',
        querystring: {
          type: 'object',
          properties: {
            emailHint: { type: 'string', description: 'Email typed on the login page — resolves a customer-specific config even when unauthenticated (I3).' },
            domainHint: { type: 'string', description: 'Raw domain, alternative to emailHint.' }
          }
        },
        response: {
          200: oidcConfigSchema,
          500: errorSchema
        }
      }
    },
    oidcController.getOidcConfig
  );

  // Save generic OIDC configuration
  fastify.post(
    '/config',
    {
      preHandler: [verifyToken, ensureAdmin, requireTierFeature('accessManagementEnabled')],
      schema: {
        tags: ['oidc'],
        summary: 'Save generic OIDC configuration',
        description: 'Updates the generic OIDC configuration settings. An omitted/empty clientSecret preserves the currently stored one.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            issuer: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectUri: { type: 'string' },
            scope: { type: 'string' },
            isCustomerSpecific: { type: 'boolean' },
            jitMode: { type: 'string', enum: ['disabled', 'domain-match', 'legacy-first-customer'] }
          },
          required: ['enabled', 'issuer', 'clientId']
        },
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean' } }
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    oidcController.saveOidcConfig
  );

  // Reset customer-specific OIDC configuration
  fastify.delete(
    '/config/reset',
    {
      preHandler: [verifyToken, ensureAdmin, requireTierFeature('accessManagementEnabled')],
      schema: {
        tags: ['oidc'],
        summary: 'Reset generic OIDC configuration',
        description: 'Resets customer-specific OIDC configuration to use global configuration',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean' } }
          },
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    oidcController.resetOidcConfig
  );

  // Get the OIDC authorization URL
  fastify.get(
    '/auth-url',
    {
      schema: {
        tags: ['oidc'],
        summary: 'Get generic OIDC authorization URL',
        description: 'Generates an OIDC authorization URL (from the discovered authorization_endpoint) for the login flow',
        querystring: {
          type: 'object',
          properties: {
            emailHint: { type: 'string', description: 'Email typed on the login page — resolves the domain to a tenant-specific config (I3).' },
            domainHint: { type: 'string', description: 'Raw domain, alternative to emailHint.' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: { authUrl: { type: 'string' }, state: { type: 'string' } }
          },
          400: errorSchema,
          500: errorSchema
        }
      }
    },
    oidcController.getAuthUrl
  );

  // Handle the OIDC callback
  fastify.post(
    '/handle-callback',
    {
      schema: {
        tags: ['oidc'],
        summary: 'Handle generic OIDC callback',
        description: 'Handles the OIDC callback by exchanging the authorization code for tokens',
        body: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            redirectUri: { type: 'string' },
            state: { type: 'string' }
          },
          required: ['code', 'redirectUri', 'state']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              idToken: { type: 'string' },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              nonce: { type: 'string' }
            }
          },
          400: errorSchema,
          500: errorSchema
        }
      }
    },
    oidcController.handleCallback
  );

  // Exchange OIDC tokens for an application JWT
  fastify.post(
    '/token-exchange',
    {
      schema: {
        tags: ['oidc'],
        summary: 'Exchange generic OIDC tokens',
        description: 'Exchanges OIDC tokens for a JWT token to use with the API',
        body: {
          type: 'object',
          properties: {
            idToken: { type: 'string' },
            accessToken: { type: 'string' },
            nonce: { type: 'string' }
          },
          required: ['idToken', 'accessToken']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              refresh_token: { type: 'string' },
              token_type: { type: 'string' },
              expires_in: { type: 'number' },
              refresh_expires_in: { type: 'number' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  role: { type: 'string' },
                  customerId: { type: 'string' },
                  authProvider: { type: 'string' }
                }
              }
            }
          },
          400: errorSchema,
          401: errorSchema,
          500: errorSchema
        }
      }
    },
    oidcController.exchangeOidcTokens
  );

  // Test a generic OIDC configuration without a real login
  fastify.post(
    '/test-connection',
    {
      preHandler: [verifyToken, ensureAdmin, requireTierFeature('accessManagementEnabled')],
      schema: {
        tags: ['oidc'],
        summary: 'Test a generic OIDC configuration',
        description: 'Validates an Issuer / Client ID / Client Secret combination without requiring a real login',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            issuer: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectUri: { type: 'string' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'string' } }
            }
          },
          401: errorSchema,
          403: errorSchema
        }
      }
    },
    oidcController.testConnection
  );
}

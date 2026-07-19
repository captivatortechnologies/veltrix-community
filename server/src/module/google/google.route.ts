import { FastifyInstance } from 'fastify';
import { googleController } from './google.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    // Machine-readable failure reason (I4) — e.g. invalid_state,
    // nonce_mismatch, provider_disabled, jit_disabled, jit_domain_not_allowed,
    // user_inactive, tenant_suspended — so the client can render specific UI.
    code: { type: 'string' }
  }
};

const googleConfigSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    clientId: { type: 'string' },
    // URGENT security fix (2026-07-11): always '' on the wire — the real
    // secret is never returned. hasClientSecret is the presence flag the
    // settings UI renders as "•••• configured".
    clientSecret: { type: 'string' },
    hasClientSecret: { type: 'boolean' },
    redirectUri: { type: 'string' },
    scope: { type: 'string' },
    isCustomerSpecific: { type: 'boolean' },
    jitMode: { type: 'string' }
  }
};

export default async function googleRoutes(fastify: FastifyInstance) {
  console.log('Registering Google OAuth routes');

  // Get Google OAuth configuration. Deliberately public (unauthenticated) —
  // SignupPage/LoginPage poll this pre-login to decide whether to render a
  // "Sign in with Google" button. URGENT security fix (2026-07-11): this
  // used to also return the decrypted clientSecret to ANY caller (curl
  // localhost:5000/api/google -> {"clientSecret":"..."}); the secret is now
  // ALWAYS redacted regardless of caller (see google.controller.ts) — every
  // other field is already necessarily public (embedded in the
  // browser-visible OAuth authorize URL during the real login flow).
  fastify.get(
    '/',
    {
      schema: {
        tags: ['google'],
        summary: 'Get Google OAuth configuration',
        description: 'Returns the current Google OAuth configuration for authentication, with clientSecret always redacted',
        response: {
          200: googleConfigSchema,
          500: errorSchema
        }
      }
    },
    googleController.getGoogleConfig
  );

  // Save Google OAuth configuration
  fastify.post(
    '/config',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['google'],
        summary: 'Save Google OAuth configuration',
        description: 'Updates the Google OAuth configuration settings. An omitted/empty clientSecret preserves the currently stored one.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectUri: { type: 'string' },
            scope: { type: 'string' },
            isCustomerSpecific: { type: 'boolean' },
            // I4 fix (2026-07-11): previously undeclared here, so Fastify's
            // default removeAdditional:true silently stripped it from the
            // body before the handler ever saw it — the JIT dropdown was
            // cosmetic for Google/Microsoft (Cognito's schema was correct).
            jitMode: { type: 'string', enum: ['disabled', 'domain-match', 'legacy-first-customer'] }
          },
          required: ['enabled', 'clientId']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' }
            }
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    googleController.saveGoogleConfig
  );

  // Reset customer-specific Google configuration
  fastify.delete(
    '/config/reset',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['google'],
        summary: 'Reset Google OAuth configuration',
        description: 'Resets customer-specific Google configuration to use global configuration',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' }
            }
          },
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    googleController.resetGoogleConfig
  );

  // Get Google OAuth authorization URL
  fastify.get(
    '/auth-url',
    {
      schema: {
        tags: ['google'],
        summary: 'Get Google OAuth authorization URL',
        description: 'Generates a Google OAuth authorization URL for the login flow',
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
            properties: {
              authUrl: { type: 'string' },
              state: { type: 'string' }
            }
          },
          500: errorSchema
        }
      }
    },
    googleController.getAuthUrl
  );

  // Handle Google OAuth callback
  fastify.post(
    '/handle-callback',
    {
      schema: {
        tags: ['google'],
        summary: 'Handle Google OAuth callback',
        description: 'Handles Google OAuth callback by exchanging authorization code for tokens',
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
    googleController.handleCallback
  );

  // Exchange Google tokens for application JWT
  fastify.post(
    '/token-exchange',
    {
      schema: {
        tags: ['google'],
        summary: 'Exchange Google tokens',
        description: 'Exchanges Google tokens for a JWT token to use with the API',
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
          500: errorSchema
        }
      }
    },
    googleController.exchangeGoogleTokens
  );

  // I4: test a Google OAuth configuration without a real login
  fastify.post(
    '/test-connection',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['google'],
        summary: 'Test a Google OAuth configuration',
        description: 'Validates a Client ID / Client Secret pair against Google without requiring a real login',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
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
    googleController.testConnection
  );
}

import { FastifyInstance } from 'fastify';
import { microsoftController } from './microsoft.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' }
  }
};

const microsoftConfigSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    clientId: { type: 'string' },
    // URGENT security fix (2026-07-11): always '' on the wire — the real
    // secret is never returned. hasClientSecret is the presence flag the
    // settings UI renders as "•••• configured".
    clientSecret: { type: 'string' },
    hasClientSecret: { type: 'boolean' },
    tenantId: { type: 'string' },
    redirectUri: { type: 'string' },
    scope: { type: 'string' },
    authority: { type: 'string' },
    isCustomerSpecific: { type: 'boolean' },
    jitMode: { type: 'string' }
  }
};

export default async function microsoftRoutes(fastify: FastifyInstance) {
  console.log('Registering Microsoft OAuth routes');

  // Get Microsoft OAuth configuration. Deliberately public (unauthenticated)
  // — SignupPage/LoginPage poll this pre-login to decide whether to render
  // a "Sign in with Microsoft" button. URGENT security fix (2026-07-11):
  // this used to also return the decrypted clientSecret to ANY caller; the
  // secret is now ALWAYS redacted regardless of caller (see
  // microsoft.controller.ts) — every other field is already necessarily
  // public (embedded in the browser-visible OAuth authorize URL during the
  // real login flow).
  fastify.get(
    '/',
    {
      schema: {
        tags: ['microsoft'],
        summary: 'Get Microsoft OAuth configuration',
        description: 'Returns the current Microsoft OAuth configuration for authentication, with clientSecret always redacted',
        response: {
          200: microsoftConfigSchema,
          500: errorSchema
        }
      }
    },
    microsoftController.getMicrosoftConfig
  );

  // Save Microsoft OAuth configuration
  fastify.post(
    '/config',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['microsoft'],
        summary: 'Save Microsoft OAuth configuration',
        description: 'Updates the Microsoft OAuth configuration settings. An omitted/empty clientSecret preserves the currently stored one.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            tenantId: { type: 'string' },
            redirectUri: { type: 'string' },
            scope: { type: 'string' },
            authority: { type: 'string' },
            isCustomerSpecific: { type: 'boolean' },
            // I4 fix (2026-07-11): previously undeclared here, so Fastify's
            // default removeAdditional:true silently stripped it from the
            // body before the handler ever saw it — the JIT dropdown was
            // cosmetic for Google/Microsoft (Cognito's schema was correct).
            jitMode: { type: 'string', enum: ['disabled', 'domain-match', 'legacy-first-customer'] }
          },
          required: ['enabled', 'clientId', 'tenantId']
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
    microsoftController.saveMicrosoftConfig
  );

  // Reset customer-specific Microsoft configuration
  fastify.delete(
    '/config/reset',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['microsoft'],
        summary: 'Reset Microsoft OAuth configuration',
        description: 'Resets customer-specific Microsoft configuration to use global configuration',
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
    microsoftController.resetMicrosoftConfig
  );

  // Get Microsoft OAuth authorization URL
  fastify.get(
    '/auth-url',
    {
      schema: {
        tags: ['microsoft'],
        summary: 'Get Microsoft OAuth authorization URL',
        description: 'Generates a Microsoft OAuth authorization URL for the login flow',
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
    microsoftController.getAuthUrl
  );

  // Handle Microsoft OAuth callback
  fastify.post(
    '/handle-callback',
    {
      schema: {
        tags: ['microsoft'],
        summary: 'Handle Microsoft OAuth callback',
        description: 'Handles Microsoft OAuth callback by exchanging authorization code for tokens',
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
              nonce: { type: 'string' }
            }
          },
          400: errorSchema,
          500: errorSchema
        }
      }
    },
    microsoftController.handleCallback
  );

  // Exchange Microsoft tokens for application JWT
  fastify.post(
    '/token-exchange',
    {
      schema: {
        tags: ['microsoft'],
        summary: 'Exchange Microsoft tokens',
        description: 'Exchanges Microsoft tokens for a JWT token to use with the API',
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
    microsoftController.exchangeMicrosoftTokens
  );

  // I4: test a Microsoft/Azure AD OAuth configuration without a real login
  fastify.post(
    '/test-connection',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['microsoft'],
        summary: 'Test a Microsoft/Azure AD OAuth configuration',
        description: 'Validates a Client ID / Client Secret / Tenant ID combination against Azure AD without requiring a real login',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            tenantId: { type: 'string' },
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
    microsoftController.testConnection
  );
}

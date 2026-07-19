import { FastifyInstance } from 'fastify';
import { cognitoController } from './cognito.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';
import { CognitoConfigResponse, CognitoTokenExchangeRequest, CognitoCallbackRequest } from './cognito.schema';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' }
  }
};

const cognitoConfigSchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    userPoolId: { type: 'string' },
    userPoolRegion: { type: 'string' },
    clientId: { type: 'string' },
    // URGENT security fix (2026-07-11): clientSecret/awsSecretAccessKey are
    // always '' on the wire — the real values are never returned. The
    // has* booleans are the presence flags the settings UI renders as
    // "•••• configured". awsAccessKeyId is a non-secret identifier (like
    // clientId) and is returned as-is.
    clientSecret: { type: 'string' },
    hasClientSecret: { type: 'boolean' },
    redirectUri: { type: 'string' },
    logoutUri: { type: 'string' },
    scope: { type: 'string' },
    isCustomerSpecific: { type: 'boolean' },
    jitMode: { type: 'string' },
    domain: { type: 'string' },
    awsAccessKeyId: { type: 'string' },
    awsSecretAccessKey: { type: 'string' },
    hasAwsSecretAccessKey: { type: 'boolean' }
  }
};

const cognitoUserSchema = {
  type: 'object',
  properties: {
    username: { type: 'string' },
    status: { type: 'string' },
    enabled: { type: 'boolean' },
    userAttributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' }
        }
      }
    },
    email: { type: 'string' },
    name: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export default async function cognitoRoutes(fastify: FastifyInstance) {
  console.log('Registering Cognito routes');
  // Get Cognito configuration. Deliberately public (unauthenticated) —
  // SignupPage/LoginPage poll this pre-login to decide whether to render
  // Cognito sign-in (LoginPage's CognitoAuthProvider also needs
  // userPoolId/clientId/redirectUri/logoutUri/scope client-side to build the
  // Hosted UI redirect). URGENT security fix (2026-07-11): this used to
  // also return the decrypted clientSecret AND the AWS awsSecretAccessKey to
  // ANY caller (curl localhost:5000/api/cognito); both secrets are now
  // ALWAYS redacted regardless of caller (see cognito.controller.ts) —
  // every other field is already necessarily public.
  fastify.get(
    '/',
    {
      schema: {
        tags: ['cognito'],
        summary: 'Get Cognito configuration',
        description: 'Returns the current Cognito configuration for authentication, with secrets always redacted',
        response: {
          200: cognitoConfigSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.getCognitoConfig
  );

  // Save Cognito configuration
  fastify.post(
    '/config',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['cognito'],
        summary: 'Save Cognito configuration',
        description: 'Updates the Cognito configuration settings. Omitted/empty clientSecret and awsSecretAccessKey preserve whatever is currently stored.',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            userPoolId: { type: 'string' },
            userPoolRegion: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            redirectUri: { type: 'string' },
            logoutUri: { type: 'string' },
            scope: { type: 'string' },
            isCustomerSpecific: { type: 'boolean' },
            jitMode: { type: 'string', enum: ['disabled', 'domain-match', 'legacy-first-customer'] },
            domain: { type: 'string' },
            // I5 fix (2026-07-11): previously undeclared here, so Fastify's
            // default removeAdditional:true silently stripped both fields
            // from the body before the handler ever saw them — the "AWS
            // credentials for admin ops" setting (I5) never actually saved.
            awsAccessKeyId: { type: 'string' },
            awsSecretAccessKey: { type: 'string' }
          },
          required: ['enabled', 'userPoolId', 'clientId']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.saveCognitoConfig
  );

  // Reset customer-specific Cognito configuration to use global configuration
  fastify.delete(
    '/config/reset',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['cognito'],
        summary: 'Reset Cognito configuration',
        description: 'Resets customer-specific Cognito configuration to use global configuration',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          },
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.resetCognitoConfig
  );

  // Disable Cognito when another SSO option is selected
  fastify.post(
    '/disable-for-sso',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['cognito'],
        summary: 'Disable Cognito for SSO',
        description: 'Disables Cognito when another SSO option is selected',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            ssoType: { type: 'string' }
          },
          required: ['ssoType']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          },
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.disableCognitoForSso
  );
  
  // Generate the AWS Cognito Hosted UI authorization URL (I3 instant-on fix
  // + I1 server-side state/nonce — mirrors /google/auth-url, /microsoft/auth-url)
  fastify.get(
    '/auth-url',
    {
      schema: {
        tags: ['cognito'],
        summary: 'Get Cognito Hosted UI authorization URL',
        description: 'Generates a Cognito Hosted UI authorization URL for the login flow',
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
          400: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.getAuthUrl
  );

  // Handle Cognito OAuth callback - exchange authorization code for tokens
  fastify.post(
    '/handle-callback',
    {
      schema: {
        tags: ['cognito'],
        summary: 'Handle Cognito callback',
        description: 'Handles Cognito OAuth callback by exchanging authorization code for tokens',
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
              expiresIn: { type: 'number' },
              nonce: { type: 'string' }
            }
          },
          400: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.handleCognitoCallback
  );

  // Exchange Cognito tokens for a JWT token
  fastify.post(
    '/token-exchange',
    {
      schema: {
        tags: ['cognito'],
        summary: 'Exchange Cognito tokens',
        description: 'Exchanges Cognito tokens for a JWT token to use with the API',
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
              // Persisted for Cognito session refresh (Fastify strips fields
              // not declared here — these were being dropped from the reply).
              refresh_token: { type: 'string' },
              token_type: { type: 'string' },
              expires_in: { type: 'number' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  role: { type: 'string' },
                  customerId: { type: 'string' }
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
    cognitoController.exchangeCognitoTokens
  );
  
  // Get all users from Cognito
  fastify.get(
    '/cognito-users',
    { 
      preHandler: [verifyToken],
      schema: {
        tags: ['cognito'],
        summary: 'Get Cognito users',
        description: 'Returns all users from the Cognito user pool',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'array',
            items: cognitoUserSchema
          },
          401: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.getCognitoUsers
  );
  
  // Create a user in Cognito
  fastify.post(
    '/create-user',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['cognito'],
        summary: 'Create Cognito user',
        description: 'Creates a new user in the Cognito user pool',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            email: { type: 'string' },
            password: { type: 'string' },
            roleId: { type: ['number', 'string'] } // Allow both number and string
          },
          required: ['email', 'roleId']
        },
        response: {
          201: cognitoUserSchema,
          400: errorSchema,
          401: errorSchema,
          409: errorSchema,
          500: errorSchema
        }
      }
    },
    cognitoController.createCognitoUser
  );

  // I4: test an AWS Cognito configuration without a real login
  fastify.post(
    '/test-connection',
    {
      preHandler: [verifyToken, ensureAdmin],
      schema: {
        tags: ['cognito'],
        summary: 'Test an AWS Cognito configuration',
        description: 'Validates a User Pool / Client ID / Client Secret / Hosted UI domain combination without requiring a real login',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            userPoolId: { type: 'string' },
            userPoolRegion: { type: 'string' },
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            domain: { type: 'string' }
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
    cognitoController.testConnection
  );
}

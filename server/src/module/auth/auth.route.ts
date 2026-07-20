import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { verifyToken } from '../../middlewares/authMiddleware';

// Define common error response schema
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

// Mirrors lib/permissions.ts PermissionSnapshot. Declared here because
// Fastify's response serialization strips any field not listed in the
// schema — the login/2FA-login responses would silently lose `permissions`
// without this.
const permissionSnapshotSchema = {
  type: 'object',
  properties: {
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          resource: { type: 'string' },
          action: { type: 'string' },
          appId: { type: ['string', 'null'] }
        }
      }
    },
    wildcards: {
      type: 'object',
      properties: {
        allAll: { type: 'boolean' },
        resources: { type: 'array', items: { type: 'string' } }
      }
    }
  }
};

export async function authRoutes(fastify: FastifyInstance) {
  // Check if user exists
  fastify.post('/auth/check-user', {
    schema: {
      tags: ['auth'],
      summary: 'Check if user exists',
      description: 'Checks if a user with the given email exists in the system',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' },
            authProvider: { type: 'string', nullable: true }
          }
        },
        400: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.checkUser
  });

  // Login
  fastify.post('/auth/login', {
    schema: {
      tags: ['auth'],
      summary: 'User login',
      description: 'Authenticates a user and returns a JWT token',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
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
                role: { type: 'string' },
                customerId: { type: 'string' }
              }
            },
            // TOTP 2FA challenge variant: when the user has 2FA enabled the
            // login response is { requires2fa: true, challengeToken } and NO
            // tokens. Declared here because Fastify strips undeclared fields.
            requires2fa: { type: 'boolean' },
            challengeToken: { type: 'string' },
            // Resolved permission snapshot (design decision 5) — same shape
            // as GET /api/me/permissions. Absent on the requires2fa variant.
            permissions: permissionSnapshotSchema
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.login
  });

  // ===== TOTP 2FA (P6) =====

  // Begin 2FA setup (authenticated). The secret stays pending (2FA NOT yet
  // enabled) until a code is verified at /auth/2fa/verify.
  fastify.post('/auth/2fa/setup', {
    preHandler: [verifyToken],
    schema: {
      tags: ['auth', '2fa'],
      summary: 'Begin TOTP two-factor setup',
      description:
        'Generates a TOTP secret (stored encrypted, pending) and returns the otpauth:// URI for authenticator apps.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          required: ['secret', 'otpauthUrl'],
          properties: {
            secret: { type: 'string' },
            otpauthUrl: { type: 'string' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.setup2fa
  });

  // Verify a TOTP code against the pending secret and enable 2FA.
  fastify.post('/auth/2fa/verify', {
    preHandler: [verifyToken],
    schema: {
      tags: ['auth', '2fa'],
      summary: 'Verify a TOTP code and enable two-factor authentication',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 8 }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['enabled', 'message'],
          properties: {
            enabled: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.verify2fa
  });

  // Disable 2FA — requires a valid TOTP code (a session alone is not enough).
  fastify.post('/auth/2fa/disable', {
    preHandler: [verifyToken],
    schema: {
      tags: ['auth', '2fa'],
      summary: 'Disable two-factor authentication (requires a valid TOTP code)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 8 }
        }
      },
      response: {
        200: {
          type: 'object',
          required: ['enabled', 'message'],
          properties: {
            enabled: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.disable2fa
  });

  // Complete a 2FA login: { challengeToken, code } -> full token pair.
  fastify.post('/auth/2fa/login', {
    schema: {
      tags: ['auth', '2fa'],
      summary: 'Complete a two-factor login',
      description:
        'Exchanges the short-lived challenge token from POST /auth/login plus a valid TOTP code for the full token pair.',
      body: {
        type: 'object',
        required: ['challengeToken', 'code'],
        properties: {
          challengeToken: { type: 'string' },
          code: { type: 'string', minLength: 6, maxLength: 8 }
        }
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
                role: { type: 'string' },
                customerId: { type: 'string' }
              }
            },
            permissions: permissionSnapshotSchema
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.twoFactorLogin
  });

  // Refresh token
  fastify.post('/auth/refresh-token', {
    schema: {
      tags: ['auth'],
      summary: 'Refresh access token',
      description: 'Use a refresh token to get a new access token without re-authentication',
      body: {
        type: 'object',
        required: ['refresh_token'],
        properties: {
          refresh_token: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            token_type: { type: 'string' },
            expires_in: { type: 'number' }
          }
        },
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.refreshToken
  });

  // Register
  fastify.post('/auth/register', {
    schema: {
      tags: ['auth'],
      summary: 'Register a new user',
      description: 'Creates a new user account',
      body: {
        type: 'object',
        required: ['name', 'email', 'password', 'customerId'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          customerId: { type: 'string', format: 'uuid' },
          authProvider: { type: 'string', enum: ['LOCAL', 'COGNITO', 'SAML', 'OAUTH'] }
        }
      },
      response: {
        // Registration returns the SAME auth object as login (tokens + user +
        // permission snapshot) so the client can sign the user straight in. The
        // old schema declared only { id, email, name }, none of which are
        // top-level on the actual result, so Fastify serialized the body to `{}`.
        201: {
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
                role: { type: 'string' },
                customerId: { type: 'string' },
                isPlatformAdmin: { type: 'boolean' }
              }
            },
            permissions: permissionSnapshotSchema
          }
        },
        400: errorSchema,
        409: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.register
  });

  // Get current user (requires authentication)
  fastify.get('/auth/me', {
    preHandler: [verifyToken],
    schema: {
      tags: ['auth'],
      summary: 'Get current user',
      description: 'Returns information about the currently authenticated user',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            customerId: { type: 'string' }
          }
        },
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.getCurrentUser
  });

  // Change password (requires authentication)
  fastify.post('/auth/change-password', {
    preHandler: [verifyToken],
    schema: {
      tags: ['auth'],
      summary: 'Change password',
      description: 'Changes the password for the currently authenticated user',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
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
        500: errorSchema
      }
    },
    handler: authController.changePassword
  });

  // Request a password-reset email (unauthenticated). Always 200 — never
  // reveals whether the email is registered.
  fastify.post('/auth/forgot-password', {
    schema: {
      tags: ['auth'],
      summary: 'Request a password reset',
      description: 'Sends a password-reset link to the email if an eligible LOCAL account exists. Always returns 200.',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string' } }
        },
        400: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.forgotPassword
  });

  // Complete a password reset with the token from the emailed link (unauthenticated).
  fastify.post('/auth/reset-password', {
    schema: {
      tags: ['auth'],
      summary: 'Reset password with a token',
      description: 'Consumes a single-use reset token and sets a new password.',
      body: {
        type: 'object',
        required: ['token', 'newPassword'],
        properties: {
          token: { type: 'string', minLength: 16 },
          newPassword: { type: 'string', minLength: 8, maxLength: 256 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string' } }
        },
        400: errorSchema,
        500: errorSchema
      }
    },
    handler: authController.resetPassword
  });

  // Note: User listing endpoints are now handled at:
  // - /api/users?authProvider=LOCAL
  // - /api/cognito/cognito-users
}

export default authRoutes;

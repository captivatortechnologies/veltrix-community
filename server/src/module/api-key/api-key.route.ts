import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyController } from './api-key.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import { verifyAuthOrApiKey } from '../../middlewares/apiKeyMiddleware';

// Define a type for authenticated requests where needed
interface AuthRequest extends FastifyRequest {
  user?: {
    id: string;
    customerId: string;
    roleId: string;
    role?: string;
  };
}
import { 
  CreateApiKeySchema,
  UpdateApiKeySchema,
  RegenerateApiKeySchema,
  ApiKeyParamsSchema 
} from './api-key.schema';

export const apiKeyRoutes = async (fastify: FastifyInstance) => {
  // Get all API keys
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.get('/api-keys', {
    preHandler: [verifyToken, hasPermission('apiKey', 'read')],
    schema: {
      description: 'Get all API keys for the authenticated customer',
      tags: ['apiKeys'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              key: { type: 'string' },
              type: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              lastUsed: { type: ['string', 'null'], format: 'date-time' },
              expiresAt: { type: ['string', 'null'], format: 'date-time' },
              revoked: { type: 'boolean' },
              roleId: { type: ['string', 'null'] },
              roleName: { type: ['string', 'null'] }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.getAllApiKeys
  });
  
  // Get API key by ID
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.get('/api-keys/:id', {
    preHandler: [verifyToken, hasPermission('apiKey', 'read')],
    schema: {
      description: 'Get an API key by ID',
      tags: ['apiKeys'],
      params: ApiKeyParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            roleId: { type: ['string', 'null'] },
            roleName: { type: ['string', 'null'] }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.getApiKeyById
  });
  
  // Create a new API key
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.post('/api-keys', {
    preHandler: [verifyToken, hasPermission('apiKey', 'write')],
    schema: {
      description: 'Create a new API key',
      tags: ['apiKeys'],
      body: CreateApiKeySchema,
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            roleId: { type: ['string', 'null'] },
            roleName: { type: ['string', 'null'] }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.createApiKey
  });
  
  // Update an API key
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.put('/api-keys/:id', {
    preHandler: [verifyToken, hasPermission('apiKey', 'write')],
    schema: {
      description: 'Update an API key',
      tags: ['apiKeys'],
      params: ApiKeyParamsSchema,
      body: UpdateApiKeySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            roleId: { type: ['string', 'null'] },
            roleName: { type: ['string', 'null'] }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.updateApiKey
  });
  
  // Regenerate an API key
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.post('/api-keys/:id/regenerate', {
    preHandler: [verifyToken, hasPermission('apiKey', 'write')],
    schema: {
      description: 'Regenerate an API key',
      tags: ['apiKeys'],
      params: ApiKeyParamsSchema,
      body: RegenerateApiKeySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            roleId: { type: ['string', 'null'] },
            roleName: { type: ['string', 'null'] }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.regenerateApiKey
  });
  
  // Revoke an API key
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.post('/api-keys/:id/revoke', {
    preHandler: [verifyToken, hasPermission('apiKey', 'write')],
    schema: {
      description: 'Revoke an API key',
      tags: ['apiKeys'],
      params: ApiKeyParamsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            key: { type: 'string' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsed: { type: ['string', 'null'], format: 'date-time' },
            expiresAt: { type: ['string', 'null'], format: 'date-time' },
            revoked: { type: 'boolean' },
            roleId: { type: ['string', 'null'] },
            roleName: { type: ['string', 'null'] }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.revokeApiKey
  });
  
  // Delete an API key
  // @ts-ignore - Bypassing type check due to incompatible FastifyRequest type
  fastify.delete('/api-keys/:id', {
    preHandler: [verifyToken, hasPermission('apiKey', 'write')],
    schema: {
      description: 'Delete an API key',
      tags: ['apiKeys'],
      params: ApiKeyParamsSchema,
      response: {
        204: {
          type: 'null',
          description: 'API key deleted successfully'
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    handler: apiKeyController.deleteApiKey
  });
};

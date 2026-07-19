import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyService } from './api-key.service';
import { loggerService } from '../logger/logger.service';

/**
 * API Key authentication routes
 * These routes allow authenticating with an API key and getting information about the key
 */

export const apiKeyAuthRoutes = async (fastify: FastifyInstance) => {
  // Authenticate with an API key
  fastify.post('/auth/api-key', {
    schema: {
      description: 'Authenticate with an API key',
      tags: ['authentication'],
      body: {
        type: 'object',
        required: ['apiKey'],
        properties: {
          apiKey: { type: 'string', description: 'The API key' },
          apiKeyId: { type: 'string', description: 'Optional API key ID for more secure lookup' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            customerId: { type: 'string' },
            type: { type: 'string' },
            role: { type: 'string', nullable: true },
            permissions: { type: 'array', items: { type: 'string' } },
            scopes: { type: 'array', items: { type: 'string' } },
            ownership: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract API key from request body
        const { apiKey, apiKeyId } = request.body as { apiKey: string; apiKeyId?: string };
        
        if (!apiKey) {
          return reply.status(400).send({ error: 'API key is required' });
        }
        
        loggerService.info('=== API KEY AUTH: Authenticating with API key ===', {
          keyPrefix: apiKey.substring(0, 4) + '••••••',
          apiKeyId: apiKeyId || 'none'
        });
        
        // First, verify the API key is valid
        const isValid = await apiKeyService.verifyApiKey(apiKey);
        
        if (!isValid) {
          loggerService.warn('=== API KEY AUTH: Invalid API key ===');
          return reply.status(401).send({ error: 'Invalid API key' });
        }
        
        // Get the API key details
        const keyDetails = await apiKeyService.getApiKeyDetails(apiKey, apiKeyId);
        
        if (!keyDetails) {
          loggerService.warn('=== API KEY AUTH: API key details not found ===');
          return reply.status(401).send({ error: 'Invalid API key' });
        }
        
        loggerService.info('=== API KEY AUTH: Successfully authenticated ===', {
          customerId: keyDetails.customerId,
          type: keyDetails.type,
          scopes: keyDetails.scopes,
          ownership: keyDetails.ownership
        });
        
        // Return the API key details
        const identity = await apiKeyService.buildKeyIdentity(keyDetails);
        reply.send({
          authenticated: true,
          customerId: identity.customerId,
          type: identity.type,
          role: identity.role,
          permissions: identity.permissions,
          scopes: identity.scopes,
          ownership: identity.ownership
        });
      } catch (error) {
        loggerService.error('=== API KEY AUTH: Error authenticating with API key ===', error);
        reply.status(500).send({ error: 'Error authenticating with API key' });
      }
    }
  });
  
  // Verify an API key (GET endpoint for Swagger/OpenAPI UI testing)
  fastify.get('/auth/api-key/verify', {
    schema: {
      description: 'Verify an API key (via header)',
      tags: ['authentication'],
      headers: {
        type: 'object',
        properties: {
          'X-API-Key': { type: 'string' },
          'X-API-Key-ID': { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            details: {
              type: 'object',
              nullable: true,
              properties: {
                customerId: { type: 'string' },
                type: { type: 'string' },
                role: { type: 'string', nullable: true },
                permissions: { type: 'array', items: { type: 'string' } },
                scopes: { type: 'array', items: { type: 'string' } },
                ownership: { type: 'string' }
              }
            }
          }
        }
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract API key from headers
        const apiKey = request.headers['x-api-key'] as string;
        const apiKeyId = request.headers['x-api-key-id'] as string;
        
        if (!apiKey) {
          return reply.send({ valid: false, details: null });
        }
        
        // Verify the API key
        const isValid = await apiKeyService.verifyApiKey(apiKey);
        
        if (!isValid) {
          return reply.send({ valid: false, details: null });
        }
        
        // Get API key details
        const keyDetails = await apiKeyService.getApiKeyDetails(apiKey, apiKeyId);
        
        if (!keyDetails) {
          return reply.send({ valid: false, details: null });
        }
        
        // Return validation result
        reply.send({
          valid: true,
          details: await apiKeyService.buildKeyIdentity(keyDetails)
        });
      } catch (error) {
        loggerService.error('=== API KEY AUTH: Error verifying API key ===', error);
        reply.status(500).send({ error: 'Error verifying API key' });
      }
    }
  });
  
  // Authenticate with Authorization header (for Postman and other API clients)
  fastify.get('/auth/api-key/check', {
    schema: {
      description: 'Check API key authentication from Authorization header',
      tags: ['authentication'],
      security: [{ apiKey: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            customerId: { type: 'string' },
            type: { type: 'string' },
            role: { type: 'string', nullable: true },
            permissions: { type: 'array', items: { type: 'string' } },
            scopes: { type: 'array', items: { type: 'string' } },
            ownership: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extract API key from Authorization header
        const authHeader = request.headers.authorization;
        let apiKey: string | undefined;
        let apiKeyId: string | undefined;
        
        if (authHeader && authHeader.startsWith('ApiKey ')) {
          apiKey = authHeader.substring(7); // Remove 'ApiKey ' prefix
        } else if (request.headers['x-api-key']) {
          apiKey = request.headers['x-api-key'] as string;
        }
        
        // Get API key ID if provided
        if (request.headers['x-api-key-id']) {
          apiKeyId = request.headers['x-api-key-id'] as string;
        }
        
        if (!apiKey) {
          return reply.status(401).send({ error: 'API key is required in Authorization header or X-API-Key header' });
        }
        
        // Verify the API key
        const isValid = await apiKeyService.verifyApiKey(apiKey);
        
        if (!isValid) {
          return reply.status(401).send({ error: 'Invalid API key' });
        }
        
        // Get API key details
        const keyDetails = await apiKeyService.getApiKeyDetails(apiKey, apiKeyId);
        
        if (!keyDetails) {
          return reply.status(401).send({ error: 'Invalid API key' });
        }
        
        // Return API key details
        const identity = await apiKeyService.buildKeyIdentity(keyDetails);
        reply.send({
          authenticated: true,
          customerId: identity.customerId,
          type: identity.type,
          role: identity.role,
          permissions: identity.permissions,
          scopes: identity.scopes,
          ownership: identity.ownership
        });
      } catch (error) {
        loggerService.error('=== API KEY AUTH: Error checking API key authentication ===', error);
        reply.status(500).send({ error: 'Error checking API key authentication' });
      }
    }
  });
};

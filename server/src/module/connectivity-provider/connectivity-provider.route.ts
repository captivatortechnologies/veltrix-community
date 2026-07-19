import { FastifyInstance } from 'fastify';
import { connectivityProviderController } from './connectivity-provider.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';
import {
  connectivityProviderSchema,
  connectivityProviderListSchema,
  createConnectivityProviderRequestSchema,
  updateConnectivityProviderRequestSchema,
  testConnectionResponseSchema,
  successMessageSchema,
  errorSchema
} from './connectivity-provider.schema';

export async function connectivityProviderRoutes(fastify: FastifyInstance) {
  // All connectivity provider routes require authentication and admin privileges
  fastify.addHook('preHandler', verifyToken);
  fastify.addHook('preHandler', ensureAdmin);

  // List all connectivity providers
  fastify.get('/connectivity-providers', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'List connectivity providers',
      description: 'Returns all connectivity providers for the authenticated customer',
      response: {
        200: connectivityProviderListSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.list
  });

  // Get a single connectivity provider by ID
  fastify.get('/connectivity-providers/:id', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Get a connectivity provider',
      description: 'Returns a single connectivity provider by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      response: {
        200: connectivityProviderSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.get
  });

  // Create a new connectivity provider
  fastify.post('/connectivity-providers', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Create a connectivity provider',
      description: 'Creates a new connectivity provider for the authenticated customer',
      body: createConnectivityProviderRequestSchema,
      response: {
        201: connectivityProviderSchema,
        400: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.create
  });

  // Update an existing connectivity provider
  fastify.put('/connectivity-providers/:id', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Update a connectivity provider',
      description: 'Updates an existing connectivity provider',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      body: updateConnectivityProviderRequestSchema,
      response: {
        200: connectivityProviderSchema,
        400: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.update
  });

  // Delete a connectivity provider
  fastify.delete('/connectivity-providers/:id', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Delete a connectivity provider',
      description: 'Deletes a connectivity provider by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      response: {
        200: successMessageSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.delete
  });

  // Test a connectivity provider's connection
  fastify.post('/connectivity-providers/:id/test', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Test a connectivity provider connection',
      description: 'Runs a live connection test against the provider and updates its status',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      response: {
        200: testConnectionResponseSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.testConnection
  });

  // Set a connectivity provider as the default
  fastify.post('/connectivity-providers/:id/set-default', {
    schema: {
      tags: ['connectivity-providers'],
      summary: 'Set a connectivity provider as default',
      description: 'Marks the specified provider as the default for the customer',
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id']
      },
      response: {
        200: connectivityProviderSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityProviderController.setDefault
  });
}

export default connectivityProviderRoutes;

import { FastifyInstance } from 'fastify';
import { connectivityController } from './connectivity.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import {
  connectivitySchema,
  connectivityCreateSchema,
  connectivityUpdateSchema,
  errorSchema,
  successMessageSchema,
  ComponentIdParamsType
} from './connectivity.schema';

export async function connectivityRoutes(fastify: FastifyInstance) {
  // All connectivity routes require authentication
  fastify.addHook('preHandler', verifyToken);

  // Get connectivity for a component
  fastify.get<{ Params: ComponentIdParamsType }>('/component/:componentId', {
    preHandler: [hasPermission('connectivity', 'read')],
    schema: {
      tags: ['connectivity'],
      summary: 'Get connectivity for a component',
      description: 'Returns connectivity details for a specific component',
      params: {
        type: 'object',
        required: ['componentId'],
        properties: {
          componentId: { type: 'string', format: 'uuid', description: 'Component ID' }
        }
      },
      response: {
        200: connectivitySchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityController.getConnectivityByComponentId
  });

  // Create or update connectivity
  fastify.post('/', {
    preHandler: [hasPermission('connectivity', 'write')],
    schema: {
      tags: ['connectivity'],
      summary: 'Create or update connectivity',
      description: 'Creates or updates connectivity for a component',
      body: connectivityCreateSchema,
      response: {
        201: connectivitySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityController.createOrUpdateConnectivity
  });

  // Update connectivity
  fastify.put<{ Params: ComponentIdParamsType }>('/component/:componentId', {
    preHandler: [hasPermission('connectivity', 'write')],
    schema: {
      tags: ['connectivity'],
      summary: 'Update connectivity',
      description: 'Updates connectivity for a specific component',
      params: {
        type: 'object',
        required: ['componentId'],
        properties: {
          componentId: { type: 'string', format: 'uuid', description: 'Component ID' }
        }
      },
      body: connectivityUpdateSchema,
      response: {
        200: connectivitySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityController.updateConnectivity
  });

  // Delete connectivity
  fastify.delete<{ Params: ComponentIdParamsType }>('/component/:componentId', {
    preHandler: [hasPermission('connectivity', 'write')],
    schema: {
      tags: ['connectivity'],
      summary: 'Delete connectivity',
      description: 'Deletes connectivity for a specific component',
      params: {
        type: 'object',
        required: ['componentId'],
        properties: {
          componentId: { type: 'string', format: 'uuid', description: 'Component ID' }
        }
      },
      response: {
        200: successMessageSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityController.deleteConnectivity
  });

  // Regenerate TailScale key
  fastify.post<{ Params: ComponentIdParamsType }>('/component/:componentId/regenerate-key', {
    preHandler: [hasPermission('connectivity', 'write')],
    schema: {
      tags: ['connectivity'],
      summary: 'Regenerate TailScale key',
      description: 'Regenerates the TailScale key for a specific component',
      params: {
        type: 'object',
        required: ['componentId'],
        properties: {
          componentId: { type: 'string', format: 'uuid', description: 'Component ID' }
        }
      },
      response: {
        200: connectivitySchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: connectivityController.regenerateTailscaleKey
  });
}

export default connectivityRoutes;

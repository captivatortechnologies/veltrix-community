import { FastifyInstance } from 'fastify';
import { logForwardingController } from './log-forwarding.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import {
  logForwardingDestinationSchema,
  logForwardingCreateSchema,
  logForwardingUpdateSchema,
  errorSchema,
  successMessageSchema
} from './log-forwarding.schema';

export async function logForwardingRoutes(fastify: FastifyInstance) {
  // Get all log forwarding destinations
  fastify.get('/log-forwarding', {
    schema: {
      tags: ['logForwarding'],
      summary: 'Get all log forwarding destinations',
      description: 'Returns a list of all log forwarding destinations for the authenticated customer',
      response: {
        200: {
          type: 'array',
          items: logForwardingDestinationSchema
        },
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('logForwarding', 'read')],
    handler: logForwardingController.getAllDestinations
  });
  
  // Create a new log forwarding destination
  fastify.post('/log-forwarding', {
    schema: {
      tags: ['logForwarding'],
      summary: 'Create a new log forwarding destination',
      description: 'Creates a new log forwarding destination for the authenticated customer',
      body: logForwardingCreateSchema,
      response: {
        201: logForwardingDestinationSchema,
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('logForwarding', 'write')],
    handler: logForwardingController.createDestination
  });
  
  // Update a log forwarding destination
  fastify.put('/log-forwarding/:id', {
    schema: {
      tags: ['logForwarding'],
      summary: 'Update a log forwarding destination',
      description: 'Updates an existing log forwarding destination',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Log forwarding destination ID' }
        }
      },
      body: logForwardingUpdateSchema,
      response: {
        200: logForwardingDestinationSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('logForwarding', 'write')],
    handler: logForwardingController.updateDestination
  });
  
  // Delete a log forwarding destination
  fastify.delete('/log-forwarding/:id', {
    schema: {
      tags: ['logForwarding'],
      summary: 'Delete a log forwarding destination',
      description: 'Deletes a log forwarding destination',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Log forwarding destination ID' }
        }
      },
      response: {
        200: successMessageSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('logForwarding', 'write')],
    handler: logForwardingController.deleteDestination
  });
  
  // Test a log forwarding destination
  fastify.post('/log-forwarding/:id/test', {
    schema: {
      tags: ['logForwarding'],
      summary: 'Test a log forwarding destination',
      description: 'Tests the connection to a log forwarding destination',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Log forwarding destination ID' }
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
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('logForwarding', 'write')],
    handler: logForwardingController.testDestination
  });
}

export default logForwardingRoutes;

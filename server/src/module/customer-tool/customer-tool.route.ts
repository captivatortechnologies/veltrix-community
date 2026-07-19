import { FastifyInstance } from 'fastify';
import { customerToolController } from './customer-tool.controller';
import { verifyToken, hasPermission, ensureCustomerMatch } from '../../middlewares/authMiddleware';
import {
  toolSchema,
  addToolBodySchema,
  successMessageSchema,
  errorSchema,
  AddToolBodyType,
  CustomerIdParamsType,
  CustomerToolParamsType
} from './customer-tool.schema';

export async function customerToolRoutes(fastify: FastifyInstance) {
  // All customer tool routes require authentication
  fastify.addHook('preHandler', verifyToken);
  
  // Get all tools configured by a specific customer
  fastify.get('/customers/:customerId/tools', {
    preHandler: [ensureCustomerMatch],
    schema: {
      tags: ['customer-tools'],
      summary: 'Get customer tools',
      description: 'Returns all tools configured by a specific customer',
      params: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', format: 'uuid', description: 'Customer ID' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: toolSchema
        },
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: customerToolController.getCustomerTools
  });
  
  // Add a tool to a customer's configured tools
  fastify.post<{
    Params: { customerId: string };
    Body: AddToolBodyType;
  }>('/customers/:customerId/tools', {
    // R4 canon rename: 'tools' -> 'tool' (matches every other tool gate;
    // migration 20260710180000_permission_app_scope renamed existing rows).
    preHandler: [ensureCustomerMatch, hasPermission('tool', 'create')],
    schema: {
      tags: ['customer-tools'],
      summary: 'Add tool to customer',
      description: 'Adds a tool to a customer\'s configured tools',
      params: {
        type: 'object',
        required: ['customerId'],
        properties: {
          customerId: { type: 'string', format: 'uuid', description: 'Customer ID' }
        }
      },
      body: addToolBodySchema,
      response: {
        201: toolSchema,
        404: errorSchema,
        409: errorSchema,
        500: errorSchema
      }
    },
    handler: customerToolController.addCustomerTool
  });
  
  // Remove a tool from a customer's configured tools
  fastify.delete<{
    Params: { customerId: string; toolId: string };
  }>('/customers/:customerId/tools/:toolId', {
    preHandler: [ensureCustomerMatch, hasPermission('tool', 'delete')],
    schema: {
      tags: ['customer-tools'],
      summary: 'Remove tool from customer',
      description: 'Removes a tool from a customer\'s configured tools',
      params: {
        type: 'object',
        required: ['customerId', 'toolId'],
        properties: {
          customerId: { type: 'string', format: 'uuid', description: 'Customer ID' },
          toolId: { type: 'string', format: 'uuid', description: 'Tool ID' }
        }
      },
      response: {
        200: successMessageSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: customerToolController.removeCustomerTool
  });
}

export default customerToolRoutes;

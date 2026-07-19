import { FastifyInstance } from 'fastify';
import { toolController } from './tool.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import { cacheMiddleware, invalidateCacheMiddleware } from '../../middlewares/cache.middleware';
import {
  toolSchema,
  toolWithIntegrationsSchema,
  toolCreateSchema,
  toolUpdateSchema,
  errorSchema,
  successMessageSchema
} from './tool.schema';
// Import the component schema defined in the generic component module
import { componentSchema } from '../component/component.route';
import { paginationQuerySchemaFastify, paginatedResponseSchemaFastify } from '../../schemas/pagination.schema';

// Cached tool GETs land under `api:/api/tools...:customer:<id>` — the
// invalidation pattern must match those literal Redis keys (deletePattern is a
// plain KEYS glob), so the old 'tools:*' matched nothing and left stale reads
// until TTL. The glob intentionally also covers `api:/api/tools/*/credentials*`
// (a tool change can affect its credential lists); over-invalidation only costs
// an extra cache miss. Mirrors the credential/component cache-pattern fixes.
const TOOL_CACHE_PATTERNS = ['api:/api/tools*'];

export async function toolRoutes(fastify: FastifyInstance) {
  // Get all tools with optional filtering
  fastify.get('/tools', {
    schema: {
      tags: ['tools'],
      summary: 'Get all tools',
      description: 'Returns a paginated list of all tools with optional filtering',
      querystring: {
        type: 'object',
        properties: {
          vendor: { type: 'string' },
          category: { type: 'string' },
          search: { type: 'string' },
          customerId: { type: 'string', format: 'uuid' },
          ...paginationQuerySchemaFastify.properties
        }
      },
      response: {
        200: paginatedResponseSchemaFastify(toolWithIntegrationsSchema),
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'read'), cacheMiddleware({ ttl: 300 })],
    handler: toolController.getAllTools
  });
  
  // Get unique vendors for filtering
  fastify.get('/tools/vendors', {
    schema: {
      tags: ['tools'],
      summary: 'Get unique vendors',
      description: 'Returns a list of unique vendors for filtering',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'string' }
        },
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'read')],
    handler: toolController.getVendors
  });
  
  // Get unique categories for filtering
  fastify.get('/tools/categories', {
    schema: {
      tags: ['tools'],
      summary: 'Get unique categories',
      description: 'Returns a list of unique categories for filtering',
      querystring: {
        type: 'object',
        properties: {
          customerId: { type: 'string', format: 'uuid' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'string' }
        },
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'read')],
    handler: toolController.getCategories
  });
  
  // Get a specific tool by ID
  fastify.get('/tools/:id', {
    schema: {
      tags: ['tools'],
      summary: 'Get tool by ID',
      description: 'Returns a specific tool by ID with its integrations',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Tool ID' }
        }
      },
      response: {
        200: toolWithIntegrationsSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'read'), cacheMiddleware({ ttl: 600 })],
    handler: toolController.getToolById
  });
  
  // Create a new tool
  fastify.post('/tools', {
    schema: {
      tags: ['tools'],
      summary: 'Create a new tool',
      description: 'Creates a new tool with the provided data',
      body: toolCreateSchema,
      response: {
        201: toolSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'write')],
    onSend: invalidateCacheMiddleware(TOOL_CACHE_PATTERNS),
    handler: toolController.createTool
  });
  
  // Update an existing tool
  fastify.put('/tools/:id', {
    schema: {
      tags: ['tools'],
      summary: 'Update a tool',
      description: 'Updates an existing tool with the provided data',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Tool ID' }
        }
      },
      body: toolUpdateSchema,
      response: {
        200: toolSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'write')],
    onSend: invalidateCacheMiddleware(TOOL_CACHE_PATTERNS),
    handler: toolController.updateTool
  });
  
  // Delete a tool
  fastify.delete('/tools/:id', {
    schema: {
      tags: ['tools'],
      summary: 'Delete a tool',
      description: 'Deletes a tool by ID (soft delete if it has integrations)',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Tool ID' }
        }
      },
      response: {
        200: successMessageSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('tool', 'write')],
    onSend: invalidateCacheMiddleware(TOOL_CACHE_PATTERNS),
    handler: toolController.deleteTool
  });

  // Get components for a specific tool
  fastify.get('/tools/:id/components', {
    schema: {
      tags: ['tools', 'components'],
      summary: 'Get components for a tool',
      description: 'Returns a list of components associated with a specific tool ID for the authenticated customer',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Tool ID' }
        }
      },
      response: {
        // Use the imported componentSchema for the list response
        200: { 
          type: 'array', 
          items: componentSchema 
        }, 
        401: errorSchema,
        404: errorSchema, // If tool ID not found? Controller might handle this.
        500: errorSchema
      }
    },
    preHandler: [verifyToken, hasPermission('component', 'read')], // Assuming 'component' resource permission
    handler: toolController.getComponentsByToolId
  });
}

export default toolRoutes;

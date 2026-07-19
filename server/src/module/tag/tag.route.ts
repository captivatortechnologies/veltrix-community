import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tagController } from './tag.controller';
import { verifyToken, hasPermission, ensureCustomerMatch } from '../../middlewares/authMiddleware';
import { loggerService } from '../../module/logger/logger.service';

// Helper function to check for either general tag permission or product-specific permission
const hasTagPermission = (action: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // First check for general tag permission
      const hasGeneralPermission = await hasPermission('tag', action)(request, reply);
      
      // If general permission check passed, continue
      if (hasGeneralPermission === undefined) {
        return;
      }
      
      // If general permission check failed, check for product-specific permissions
      // This would require additional logic to determine which product the tag belongs to
      // For now, we'll just check for specific product permissions
      
      // Example: Check for splunk-enterprise permission
      const hasSplunkEnterprisePermission = await hasPermission('splunk-enterprise', action)(request, reply);
      if (hasSplunkEnterprisePermission === undefined) {
        return;
      }
      
      // If we get here, the user doesn't have permission
      return reply.status(403).send({ 
        error: `Access denied: You don't have permission to ${action} tags`
      });
    } catch (error) {
      loggerService.error('Error in tag permission middleware:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  };
};

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    color: { type: 'string' },
    description: { type: 'string' },
    customerId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const createTagSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string' },
    color: { type: 'string' },
    description: { type: 'string' }
  }
};

const updateTagSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    color: { type: 'string' },
    description: { type: 'string' }
  }
};

const customerIdParamsSchema = {
  type: 'object',
  required: ['customerId'],
  properties: {
    customerId: { type: 'string', format: 'uuid', description: 'Customer ID' }
  }
};

const tagIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Tag ID' }
  }
};

const customerIdTagIdParamsSchema = {
  type: 'object',
  required: ['customerId', 'id'],
  properties: {
    customerId: { type: 'string', format: 'uuid', description: 'Customer ID' },
    id: { type: 'string', format: 'uuid', description: 'Tag ID' }
  }
};

const productIdParamsSchema = {
  type: 'object',
  required: ['productId'],
  properties: {
    productId: { type: 'string', description: 'Product ID' }
  }
};

export async function tagRoutes(fastify: FastifyInstance) {
  // Routes with customer ID in URL for multi-tenancy
  
  // Get all tags for a customer
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/customers/:customerId/tags', {
    preHandler: [verifyToken, ensureCustomerMatch, hasPermission('tag', 'read')],
    schema: {
      tags: ['tags'],
      summary: 'Get customer tags',
      description: 'Returns all tags for a specific customer',
      params: customerIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: tagSchema
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.getAllTagsWithCustomerId
  });
  
  // Create a new tag for a customer
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.post('/customers/:customerId/tags', {
    preHandler: [verifyToken, ensureCustomerMatch, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Create customer tag',
      description: 'Creates a new tag for a specific customer',
      params: customerIdParamsSchema,
      body: createTagSchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: tagSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.createTagWithCustomerId
  });
  
  // Update a tag for a customer
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.put('/customers/:customerId/tags/:id', {
    preHandler: [verifyToken, ensureCustomerMatch, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Update customer tag',
      description: 'Updates an existing tag for a specific customer',
      params: customerIdTagIdParamsSchema,
      body: updateTagSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: tagSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.updateTagWithCustomerId
  });
  
  // Delete a tag for a customer
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.delete('/customers/:customerId/tags/:id', {
    preHandler: [verifyToken, ensureCustomerMatch, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Delete customer tag',
      description: 'Deletes a tag for a specific customer',
      params: customerIdTagIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        204: {
          type: 'null',
          description: 'No content'
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.deleteTagWithCustomerId
  });
  
  // Legacy routes without customer ID (for backward compatibility)
  // These will use the customer ID from the authentication token
  
  // Get all tags
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/tags', {
    preHandler: [verifyToken, hasPermission('tag', 'read')],
    schema: {
      tags: ['tags'],
      summary: 'Get all tags',
      description: 'Returns all tags for the authenticated user\'s customer',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: tagSchema
        },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.getAllTags
  });
  
  // Create a new tag
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.post('/tags', {
    preHandler: [verifyToken, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Create tag',
      description: 'Creates a new tag for the authenticated user\'s customer',
      body: createTagSchema,
      security: [{ bearerAuth: [] }],
      response: {
        201: tagSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.createTag
  });
  
  // Update a tag
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.put('/tags/:id', {
    preHandler: [verifyToken, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Update tag',
      description: 'Updates an existing tag for the authenticated user\'s customer',
      params: tagIdParamsSchema,
      body: updateTagSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: tagSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.updateTag
  });
  
  // Delete a tag
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.delete('/tags/:id', {
    preHandler: [verifyToken, hasPermission('tag', 'write')],
    schema: {
      tags: ['tags'],
      summary: 'Delete tag',
      description: 'Deletes a tag for the authenticated user\'s customer',
      params: tagIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        204: {
          type: 'null',
          description: 'No content'
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.deleteTag
  });
  
  // Product-specific tag routes
  
  // Get tags for a specific product
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/products/:productId/tags', {
    preHandler: [
      verifyToken, 
      async (request: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) => {
        const { productId } = request.params;
        // Check for product-specific permission
        return hasPermission(`product-${productId}`, 'read')(request, reply);
      }
    ],
    schema: {
      tags: ['tags'],
      summary: 'Get product tags',
      description: 'Returns tags associated with a specific product',
      params: productIdParamsSchema,
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: tagSchema
        },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tagController.getTagsByProductId
  });
  
  // Add a test route to check if the server is working
  fastify.get('/test', async (_, reply) => {
    reply.send({ message: 'Tag routes are working!' });
  });
}

export default tagRoutes;

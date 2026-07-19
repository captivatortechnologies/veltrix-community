import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { credentialController } from './credential.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import prisma from '../../db';
import { loggerService } from '../../module/logger/logger.service';
import { cacheMiddleware, invalidateCacheMiddleware } from '../../middlewares/cache.middleware';
import {
  redactedCredentialSchema,
  credentialCreateSchema,
  credentialUpdateSchema,
  errorSchema,
  successMessageSchema
} from './credential.schema';

// Helper function to check for either general credential permission or product-specific permission
const hasCredentialPermission = (action: string) => {
  return async (request: FastifyRequest<{ Params: { toolId?: string; id?: string } }>, reply: FastifyReply) => {
    try {
      // First check for general credential permission
      const hasGeneralPermission = await hasPermission('credential', action)(request, reply);
      
      // If general permission check passed, continue
      if (hasGeneralPermission === undefined) {
        return;
      }
      
      // If general permission check failed, check for product-specific permissions
      // This would require additional logic to determine which product the credential belongs to
      // For now, we'll just check for specific product permissions based on toolId
      
      // Get the toolId from the request
      const toolId = request.params.toolId || 
                    (request.params.id ? await getToolIdForCredential(request.params.id) : null);
      
      if (toolId) {
        // Get the product name for this tool
        const productName = await getProductNameForTool(toolId);
        
        if (productName) {
          // Check for product-specific permission
          const hasProductPermission = await hasPermission(productName, action)(request, reply);
          if (hasProductPermission === undefined) {
            return;
          }
        }
      }
      
      // If we get here, the user doesn't have permission
      return reply.status(403).send({ 
        error: `Access denied: You don't have permission to ${action} credentials`
      });
    } catch (error) {
      loggerService.error('Error in credential permission middleware:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  };
};

// Helper function to get the toolId for a credential using raw SQL query
async function getToolIdForCredential(credentialId: string): Promise<string | null> {
  try {
    // Use raw SQL to query for toolId directly
    const result = await prisma.$queryRaw<Array<{ toolId: string }>>`
      SELECT "toolId" FROM "Credential" WHERE id = ${credentialId}
    `;
    
    return result && result.length > 0 ? result[0].toolId : null;
  } catch (error) {
    loggerService.error('Error getting toolId for credential:', error);
    return null;
  }
}

// Helper function to get the product name for a tool
async function getProductNameForTool(toolId: string): Promise<string | null> {
  try {
    const tool = await prisma.tool.findUnique({
      where: { id: toolId }
    });
    
    if (!tool) {
      return null;
    }
    
    // Convert tool name to kebab-case for permission resource
    return tool.name.toLowerCase().replace(/\s+/g, '-');
  } catch (error) {
    loggerService.error('Error getting product name for tool:', error);
    return null;
  }
}

// cacheMiddleware keys every cached GET as `${keyPrefix}:${request.url}` (see
// middlewares/cache.middleware.ts) — keyPrefix defaults to 'api' and request.url
// includes the full mounted path, so this module's cached reads land under
// 'api:/api/credentials...' and 'api:/api/tools/:toolId/credentials'. The
// invalidation patterns below MUST match those literal keys — `deletePattern`
// does a plain Redis `KEYS <pattern>` with no implicit prefixing, so a pattern
// like the old 'credential:*' (no 'api:' prefix) never matches anything and
// silently no-ops, leaving every create/update/delete serving a stale cached
// list (up to the 300s/600s TTL) until it happens to expire. Verified live via
// the E2E "register a Falcon API connection" spec: X-Cache: HIT with
// X-Cache-Key: api:/api/tools/<id>/credentials on every read after a create.
const CREDENTIAL_CACHE_PATTERNS = ['api:/api/credentials*', 'api:/api/tools/*/credentials*'];

export async function credentialRoutes(fastify: FastifyInstance) {
  // Get all credentials for a specific tool
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/tools/:toolId/credentials', {
    schema: {
      tags: ['credentials'],
      summary: 'Get all credentials for a tool',
      description: 'Returns a list of all credentials associated with a specific tool',
      params: {
        type: 'object',
        required: ['toolId'],
        properties: {
          toolId: { type: 'string', description: 'Tool ID' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: redactedCredentialSchema
        },
        500: errorSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: [verifyToken, hasPermission('credential', 'read'), cacheMiddleware({ ttl: 300 })],
    handler: credentialController.getCredentialsByToolId
  });
  
  // Get a specific credential by ID
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.get('/credentials/:id', {
    schema: {
      tags: ['credentials'],
      summary: 'Get credential by ID',
      description: 'Returns a specific credential by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Credential ID' }
        }
      },
      response: {
        200: redactedCredentialSchema,
        404: errorSchema,
        500: errorSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: [verifyToken, hasPermission('credential', 'read'), cacheMiddleware({ ttl: 600 })],
    handler: credentialController.getCredentialById
  });
  
  // Create a new credential
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.post('/credentials', {
    schema: {
      tags: ['credentials'],
      summary: 'Create a new credential',
      description: 'Creates a new credential with the provided data',
      body: credentialCreateSchema,
      response: {
        201: redactedCredentialSchema,
        500: errorSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: [verifyToken, hasPermission('credential', 'write')],
    onSend: invalidateCacheMiddleware(CREDENTIAL_CACHE_PATTERNS),
    handler: credentialController.createCredential
  });
  
  // Update an existing credential
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.put('/credentials/:id', {
    schema: {
      tags: ['credentials'],
      summary: 'Update a credential',
      description: 'Updates an existing credential with the provided data',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Credential ID' }
        }
      },
      body: credentialUpdateSchema,
      response: {
        200: redactedCredentialSchema,
        404: errorSchema,
        500: errorSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: [verifyToken, hasPermission('credential', 'write')],
    onSend: invalidateCacheMiddleware(CREDENTIAL_CACHE_PATTERNS),
    handler: credentialController.updateCredential
  });
  
  // Delete a credential
  // @ts-ignore - Suppressing TypeScript errors for middleware type compatibility
  fastify.delete('/credentials/:id', {
    schema: {
      tags: ['credentials'],
      summary: 'Delete a credential',
      description: 'Deletes a credential by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Credential ID' }
        }
      },
      response: {
        200: successMessageSchema,
        500: errorSchema
      },
      security: [{ bearerAuth: [] }]
    },
    preHandler: [verifyToken, hasPermission('credential', 'write')],
    onSend: invalidateCacheMiddleware(CREDENTIAL_CACHE_PATTERNS),
    handler: credentialController.deleteCredential
  });
}

export default credentialRoutes;

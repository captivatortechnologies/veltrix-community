import { FastifyInstance } from 'fastify';
import { componentController } from './component.controller';
import { verifyToken, ensureCustomerMatch, hasPermission } from '../../middlewares/authMiddleware';
import { cacheMiddleware, invalidateCacheMiddleware } from '../../middlewares/cache.middleware';
import { checkTenantQuota } from '../../middlewares/tenant-isolation.middleware';

// cacheMiddleware keys every cached GET as `api:${request.url}...:customer:<id>`
// (see middlewares/cache.middleware.ts). `deletePattern` runs a plain Redis
// `KEYS <pattern>` with no implicit prefixing, so the invalidation pattern MUST
// match those literal keys — the old 'component:*' matched nothing and silently
// left every create/update/delete serving a stale cached list until the 300s
// TTL expired. Mirrors the credential route's CREDENTIAL_CACHE_PATTERNS fix.
const COMPONENT_CACHE_PATTERNS = ['api:/api/components*'];

// Define basic schemas (can be expanded later)
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

// Define schema for creating a component
const createComponentSchema = {
  type: 'object',
  required: ['type', 'hostname', 'port', 'toolId'],
  properties: {
    type: { type: 'array', items: { type: 'string' }, minItems: 1 }, // Expect non-empty array of strings
    hostname: { type: 'string' },
    port: { type: 'string' },
    webPort: { type: 'string', nullable: true },
    sshUser: { type: 'string', nullable: true },
    splunkHome: { type: 'string', nullable: true },
    toolId: { type: 'string', format: 'uuid' },
    tagIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      nullable: true
    },
    domains: { type: 'array', items: { type: 'string' }, nullable: true },
    ipRanges: { type: 'array', items: { type: 'string' }, nullable: true },
    // Access Server links: the Connection (credential) and the ZTNA provider.
    credentialId: { type: 'string', nullable: true },
    connectivityProviderId: { type: 'string', nullable: true },
  }
};

// Define and export the component schema (for response)
export const componentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    customerId: { type: 'string' },
    toolId: { type: 'string' },
    type: { type: 'array', items: { type: 'string' } },
    hostname: { type: 'string' },
    port: { type: 'string' },
    webPort: { type: 'string', nullable: true },
    sshUser: { type: 'string', nullable: true },
    splunkHome: { type: 'string', nullable: true },
    domains: { type: 'array', items: { type: 'string' } },
    ipRanges: { type: 'array', items: { type: 'string' } },
    connectivityProviderId: { type: 'string', nullable: true },
    credentialId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    tool: { 
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        vendor: { type: 'string' },
        category: { type: 'string' },
        // Add other tool properties if needed
      }
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          // Add other tag properties if needed
        }
      }
    }
    // Add other component properties if needed
  }
};

export async function componentRoutes(fastify: FastifyInstance) {
  // Apply authentication and customer matching middleware
  fastify.addHook('preHandler', verifyToken);
  fastify.addHook('preHandler', ensureCustomerMatch); // Ensure requests are scoped to the customer

  // Get all components for the current customer
  fastify.get('/', {
    preHandler: [hasPermission('component', 'read'), cacheMiddleware({ ttl: 300 })],
    schema: {
      tags: ['Components'], // Add a tag for Swagger
      summary: 'Get all components',
      description: 'Returns all components configured for the authenticated customer, including related tool information.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: componentSchema
        },
        401: errorSchema,
        500: errorSchema
      }
    },
    handler: componentController.getAllComponents
  });

  // Create a new component
  // The 'components' quota gate counts the tenant's components against the
  // tier's maxComponents (overridable per-tenant via Subscription.maxComponents).
  fastify.post('/', {
    preHandler: [hasPermission('component', 'write'), checkTenantQuota('components')],
    onSend: invalidateCacheMiddleware(COMPONENT_CACHE_PATTERNS),
    schema: {
      tags: ['Components'],
      summary: 'Create component',
      description: 'Creates a new component for the authenticated customer (subject to the tier component quota).',
      security: [{ bearerAuth: [] }],
      body: createComponentSchema,
      response: {
        201: componentSchema, // Use the existing component schema for the response
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        429: errorSchema,
        500: errorSchema
      }
    },
    handler: componentController.createComponent
  });

  // Update an existing component
  fastify.put('/:id', {
    preHandler: [hasPermission('component', 'write')],
    onSend: invalidateCacheMiddleware(COMPONENT_CACHE_PATTERNS),
    schema: {
      tags: ['Components'],
      summary: 'Update component',
      description: 'Updates an existing component belonging to the authenticated customer.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          type: { type: 'array', items: { type: 'string' }, minItems: 1 },
          hostname: { type: 'string' },
          port: { type: 'string' },
          webPort: { type: 'string', nullable: true },
          sshUser: { type: 'string', nullable: true },
          splunkHome: { type: 'string', nullable: true },
          tagIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            nullable: true
          },
          domains: { type: 'array', items: { type: 'string' }, nullable: true },
          ipRanges: { type: 'array', items: { type: 'string' }, nullable: true },
          credentialId: { type: 'string', nullable: true },
          connectivityProviderId: { type: 'string', nullable: true }
        }
      },
      response: {
        200: componentSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: componentController.updateComponent
  });

  // Delete a component
  fastify.delete('/:id', {
    preHandler: [hasPermission('component', 'write')],
    onSend: invalidateCacheMiddleware(COMPONENT_CACHE_PATTERNS),
    schema: {
      tags: ['Components'],
      summary: 'Delete component',
      description: 'Deletes a component belonging to the authenticated customer.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      response: {
        204: { type: 'null' },
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: componentController.deleteComponent
  });

  // Assign a connectivity provider to one or more components
  fastify.post('/assign-provider', {
    preHandler: [hasPermission('component', 'write')],
    onSend: invalidateCacheMiddleware(COMPONENT_CACHE_PATTERNS),
    schema: {
      tags: ['Components'],
      summary: 'Assign connectivity provider to components',
      description: 'Assigns (or clears) a connectivity provider for one or more components belonging to the authenticated customer.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['componentIds', 'connectivityProviderId'],
        properties: {
          componentIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1 },
          connectivityProviderId: { type: ['string', 'null'], format: 'uuid', nullable: true },
        },
      },
      response: {
        200: { type: 'object', properties: { updated: { type: 'number' } } },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema,
      },
    },
    handler: componentController.assignProvider,
  });
}

export default componentRoutes;

import { FastifyInstance } from 'fastify';
import { roleController } from './role.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import { requireTierFeature } from '../../middlewares/tenant-isolation.middleware';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const permissionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    resource: { type: 'string' },
    action: { type: 'string' },
    roleId: { type: 'string', format: 'uuid' },
    // R5: null = platform-scoped, a real App.id = app-scoped. Fastify strips
    // undeclared response fields, so this must be listed even though it's
    // nullable.
    appId: { type: ['string', 'null'] }
  }
};

const roleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string' },
    customerId: { type: 'string', format: 'uuid' },
    isSystemRole: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    permissions: {
      type: 'array',
      items: permissionSchema
    }
  }
};

const createRoleSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['resource', 'action'],
        properties: {
          resource: { type: 'string' },
          action: { type: 'string' },
          // R5: omit/null for a platform-scoped grant; a real App.id for an
          // app-scoped one (design decision 1).
          appId: { type: ['string', 'null'] }
        }
      }
    }
  }
};

const updateRoleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    permissions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['resource', 'action'],
        properties: {
          resource: { type: 'string' },
          action: { type: 'string' },
          // R5: omit/null for a platform-scoped grant; a real App.id for an
          // app-scoped one (design decision 1).
          appId: { type: ['string', 'null'] }
        }
      }
    }
  }
};

export async function roleRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes
  fastify.addHook('preHandler', verifyToken);
  
  // Get all roles for the current customer
  fastify.get('/roles', {
    preHandler: [hasPermission('role', 'read')],
    schema: {
      tags: ['roles'],
      summary: 'Get all roles',
      description: 'Returns all roles for the authenticated customer',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: roleSchema
        },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.getRoles
  });

  // Get a role by ID
  fastify.get('/roles/:id', {
    preHandler: [hasPermission('role', 'read')],
    schema: {
      tags: ['roles'],
      summary: 'Get role by ID',
      description: 'Returns a specific role by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Role ID' }
        }
      },
      response: {
        200: roleSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.getRoleById
  });

  // Create a new role
  fastify.post('/roles', {
    preHandler: [hasPermission('role', 'write'), requireTierFeature('accessManagementEnabled')],
    schema: {
      tags: ['roles'],
      summary: 'Create role',
      description: 'Creates a new role for the authenticated customer',
      security: [{ bearerAuth: [] }],
      body: createRoleSchema,
      response: {
        201: roleSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.createRole
  });

  // Update a role
  fastify.put('/roles/:id', {
    preHandler: [hasPermission('role', 'write'), requireTierFeature('accessManagementEnabled')],
    schema: {
      tags: ['roles'],
      summary: 'Update role',
      description: 'Updates an existing role',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Role ID' }
        }
      },
      body: updateRoleSchema,
      response: {
        200: roleSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.updateRole
  });

  // Delete a role
  fastify.delete('/roles/:id', {
    preHandler: [hasPermission('role', 'write'), requireTierFeature('accessManagementEnabled')],
    schema: {
      tags: ['roles'],
      summary: 'Delete role',
      description: 'Deletes an existing role',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Role ID' }
        }
      },
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
    handler: roleController.deleteRole
  });

  // Get available resources — R4: the live catalog (enforced platform
  // resources + the customer's installed apps' declared permissions/config
  // types), replacing the old hardcoded, drifted placeholder list.
  fastify.get('/resources', {
    preHandler: [hasPermission('role', 'read')],
    schema: {
      tags: ['roles'],
      summary: 'Get available resources',
      description:
        'Returns the live resource catalog for role permissions: enforced platform resources plus the ' +
        "customer's installed apps' declared permissions and configuration types.",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              resource: { type: 'string' },
              actions: { type: 'array', items: { type: 'string' } },
              appId: { type: ['string', 'null'] },
              appName: { type: 'string' },
              description: { type: 'string' }
            }
          }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.getResources
  });

  // Get available actions for a resource. Pass ?appId=<App.id> to look up
  // an app-scoped resource (e.g. a configTypeId) rather than a platform one.
  fastify.get('/resources/:resource/actions', {
    preHandler: [hasPermission('role', 'read')],
    schema: {
      tags: ['roles'],
      summary: 'Get resource actions',
      description: 'Returns the available actions for a specific resource, optionally scoped to an app.',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['resource'],
        properties: {
          resource: { type: 'string', description: 'Resource name' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          appId: { type: 'string', description: 'Scope the lookup to this app (App.id)' }
        }
      },
      response: {
        200: {
          type: 'array',
          items: { type: 'string' }
        },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: roleController.getActions
  });
}

export default roleRoutes;

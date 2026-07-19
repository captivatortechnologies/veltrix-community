import { FastifyInstance } from 'fastify';
import { tailscaleController } from './tailscale.controller';
import { verifyToken, hasPermission, ensureAdmin } from '../../middlewares/authMiddleware';
import { TailscaleKeyRequestType, TailscaleConfigRequestType } from './tailscale.schema';

// Define common schemas
const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

const tailscaleDeviceSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    hostname: { type: 'string' },
    user: { type: 'string' },
    addresses: { 
      type: 'array',
      items: { type: 'string' }
    },
    clientVersion: { type: 'string' },
    os: { type: 'string' },
    created: { type: 'string', format: 'date-time' },
    lastSeen: { type: 'string', format: 'date-time' },
    isOnline: { type: 'boolean' },
    tags: {
      type: 'array',
      items: { type: 'string' }
    }
  }
};

const tailscaleConfigSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    apiUrl: { type: 'string' },
    tailnet: { type: 'string' },
    apiKey: { type: 'string' },
    enabled: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const tailscaleKeySchema = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' }
  }
};

export async function tailscaleRoutes(fastify: FastifyInstance) {
  // Check if Tailscale is configured
  fastify.get('/tailscale/config', {
    preHandler: [verifyToken, hasPermission('tailscale', 'read')],
    schema: {
      tags: ['tailscale'],
      summary: 'Check Tailscale configuration',
      description: 'Checks if Tailscale is configured for the authenticated user',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            isConfigured: { type: 'boolean' },
            config: tailscaleConfigSchema
          }
        },
        401: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.checkConfig);
  
  // Get all Tailscale devices
  fastify.get('/tailscale/devices', {
    preHandler: [verifyToken, hasPermission('tailscale', 'read')],
    schema: {
      tags: ['tailscale'],
      summary: 'Get all Tailscale devices',
      description: 'Returns a list of all Tailscale devices',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: tailscaleDeviceSchema
        },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.getAllDevices);

  // Get a single Tailscale device by ID
  fastify.get<{ Params: { id: string } }>('/tailscale/devices/:id', {
    preHandler: [verifyToken, hasPermission('tailscale', 'read')],
    schema: {
      tags: ['tailscale'],
      summary: 'Get Tailscale device by ID',
      description: 'Returns a specific Tailscale device by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Device ID' }
        }
      },
      response: {
        200: tailscaleDeviceSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.getDeviceById);

  // Generate a Tailscale key
  fastify.post<{ Body: TailscaleKeyRequestType }>('/tailscale/keys', {
    preHandler: [verifyToken, hasPermission('tailscale', 'write')],
    schema: {
      tags: ['tailscale'],
      summary: 'Generate Tailscale key',
      description: 'Generates a new Tailscale authentication key',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['componentId', 'description', 'customerId'],
        properties: {
          componentId: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
          customerId: { type: 'string', format: 'uuid' },
          reusable: { type: 'boolean' },
          ephemeral: { type: 'boolean' },
          tags: { 
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      response: {
        201: tailscaleKeySchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.generateKey);

  // Delete a Tailscale device
  fastify.delete<{ Params: { id: string } }>('/tailscale/device/:id', {
    preHandler: [verifyToken, hasPermission('tailscale', 'write')],
    schema: {
      tags: ['tailscale'],
      summary: 'Delete Tailscale device',
      description: 'Deletes a Tailscale device from the network',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Device ID' }
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
    }
  }, tailscaleController.deleteDevice);

  // Get Tailscale configuration — genuinely admin-only: TailscaleConfig is a
  // platform-wide singleton (no customerId scoping), so a resource-level
  // grant isn't the right gate; ensureAdmin (tenant all:all or platform
  // operator) matches the pre-existing "(admin only)" doc comment's intent.
  fastify.get('/tailscale/global-config', {
    preHandler: [verifyToken, ensureAdmin],
    schema: {
      tags: ['tailscale'],
      summary: 'Get global Tailscale configuration',
      description: 'Returns the global Tailscale configuration (admin only)',
      security: [{ bearerAuth: [] }],
      response: {
        200: tailscaleConfigSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.getConfig);
  
  // Create or update Tailscale configuration (admin only)
  fastify.post('/tailscale/global-config', {
    preHandler: [verifyToken, ensureAdmin],
    schema: {
      tags: ['tailscale'],
      summary: 'Create or update global Tailscale configuration',
      description: 'Creates or updates the global Tailscale configuration (admin only)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tailnet', 'apiKey'],
        properties: {
          apiUrl: { type: 'string' },
          tailnet: { type: 'string' },
          apiKey: { type: 'string' }
        }
      },
      response: {
        200: tailscaleConfigSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.upsertConfig);
  
  // Delete Tailscale configuration (admin only)
  fastify.delete('/tailscale/global-config', {
    preHandler: [verifyToken, ensureAdmin],
    schema: {
      tags: ['tailscale'],
      summary: 'Delete global Tailscale configuration',
      description: 'Deletes the global Tailscale configuration (admin only)',
      security: [{ bearerAuth: [] }],
      response: {
        204: {
          type: 'null',
          description: 'No content'
        },
        401: errorSchema,
        403: errorSchema,
        500: errorSchema
      }
    }
  }, tailscaleController.deleteConfig);
}

export default tailscaleRoutes;

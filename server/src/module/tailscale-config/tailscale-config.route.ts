import { FastifyInstance } from 'fastify';
import { tailscaleConfigController } from './tailscale-config.controller';
import { verifyToken, ensureAdmin } from '../../middlewares/authMiddleware';
import {
  tailscaleConfigSchema,
  tailscaleConfigRequestSchema,
  tailscaleConfigCheckSchema,
  successMessageSchema,
  errorSchema
} from './tailscale-config.schema';

export async function tailscaleConfigRoutes(fastify: FastifyInstance) {
  // All tailscale config routes require authentication and admin privileges
  fastify.addHook('preHandler', verifyToken);
  fastify.addHook('preHandler', ensureAdmin);
  
  // Get Tailscale configuration
  fastify.get('/tailscale-config', {
    schema: {
      tags: ['tailscale-config'],
      summary: 'Get Tailscale configuration',
      description: 'Returns the global Tailscale configuration',
      response: {
        200: tailscaleConfigSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: tailscaleConfigController.getConfig
  });
  
  // Create or update Tailscale configuration
  fastify.post('/tailscale-config', {
    schema: {
      tags: ['tailscale-config'],
      summary: 'Create or update Tailscale configuration',
      description: 'Creates or updates the global Tailscale configuration',
      body: tailscaleConfigRequestSchema,
      response: {
        201: tailscaleConfigSchema,
        400: errorSchema,
        500: errorSchema
      }
    },
    handler: tailscaleConfigController.upsertConfig
  });
  
  // Delete Tailscale configuration
  fastify.delete('/tailscale-config', {
    schema: {
      tags: ['tailscale-config'],
      summary: 'Delete Tailscale configuration',
      description: 'Deletes the global Tailscale configuration',
      response: {
        200: successMessageSchema,
        500: errorSchema
      }
    },
    handler: tailscaleConfigController.deleteConfig
  });
  
  // Check if Tailscale is configured
  fastify.get('/tailscale-config/check', {
    schema: {
      tags: ['tailscale-config'],
      summary: 'Check Tailscale configuration',
      description: 'Checks if Tailscale is configured',
      response: {
        200: tailscaleConfigCheckSchema,
        500: errorSchema
      }
    },
    handler: tailscaleConfigController.checkConfig
  });
}

export default tailscaleConfigRoutes;

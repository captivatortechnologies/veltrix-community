import { FastifyInstance } from 'fastify';
import { organizationController } from './organization.controller';
import { hasPermission } from '../../middlewares/authMiddleware';
import { verifyAuthOrApiKey } from '../../middlewares/apiKeyMiddleware';
import {
  organizationSchema,
  organizationUpdateSchema,
  errorSchema
} from './organization.schema';

export async function organizationRoutes(fastify: FastifyInstance) {
  // All organization routes require authentication (via JWT token or API key)
  fastify.addHook('preHandler', verifyAuthOrApiKey);

  // Get organization details
  fastify.get('/', {
    preHandler: [hasPermission('organization', 'read')],
    schema: {
      tags: ['organizations'],
      summary: 'Get organization details',
      description: 'Returns the organization details for the authenticated user',
      security: [
        { apiKey: [] },
        { bearerAuth: [] }
      ],
      response: {
        200: organizationSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: organizationController.getOrganization
  });

  // Update organization details
  fastify.put('/', {
    preHandler: [hasPermission('organization', 'write')],
    schema: {
      tags: ['organizations'],
      summary: 'Update organization details',
      description: 'Updates the organization details for the authenticated user',
      security: [
        { apiKey: [] },
        { bearerAuth: [] }
      ],
      body: organizationUpdateSchema,
      response: {
        200: organizationSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: organizationController.updateOrganization
  });
}

export default organizationRoutes;

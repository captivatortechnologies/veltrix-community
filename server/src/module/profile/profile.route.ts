import { FastifyInstance } from 'fastify';
import { profileController } from './profile.controller';
import { verifyToken } from '../../middlewares/authMiddleware';
import {
  profileSchema,
  profileUpdateSchema,
  settingsSchema,
  settingsUpdateSchema,
  errorSchema
} from './profile.schema';

export async function profileRoutes(fastify: FastifyInstance) {
  // All profile routes require authentication
  fastify.addHook('preHandler', verifyToken);
  
  // Get user profile
  fastify.get('/profile', {
    schema: {
      tags: ['profile'],
      summary: 'Get user profile',
      description: 'Returns the profile of the authenticated user',
      response: {
        200: profileSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: profileController.getProfile
  });
  
  // Update user profile
  fastify.put('/profile', {
    schema: {
      tags: ['profile'],
      summary: 'Update user profile',
      description: 'Updates the profile of the authenticated user',
      body: profileUpdateSchema,
      response: {
        200: profileSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: profileController.updateProfile
  });
  
  // Get user settings
  fastify.get('/profile/settings', {
    schema: {
      tags: ['profile'],
      summary: 'Get user settings',
      description: 'Returns the settings of the authenticated user',
      response: {
        200: settingsSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: profileController.getSettings
  });
  
  // Update user settings
  fastify.put('/profile/settings', {
    schema: {
      tags: ['profile'],
      summary: 'Update user settings',
      description: 'Updates the settings of the authenticated user',
      body: settingsUpdateSchema,
      response: {
        200: settingsSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    handler: profileController.updateSettings
  });
}

export default profileRoutes;

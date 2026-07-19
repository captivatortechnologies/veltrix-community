import { FastifyRequest, FastifyReply } from 'fastify';
import { profileService } from './profile.service';
import { 
  ProfileUpdateRequestType, 
  SettingsUpdateRequestType
} from './profile.schema';
import { loggerService } from '../../module/logger/logger.service';

/**
 * Resolve the authenticated user id.
 *
 * These routes run behind `middlewares/authMiddleware.verifyToken`, which
 * decorates `request.user` and does NOT set the `x-user-id` header. The older
 * `middlewares/authMiddleware` (and the API-key middleware) do set that header,
 * so it remains a fallback for routes still on that chain.
 */
const getUserId = (request: FastifyRequest): string | undefined =>
  request.user?.id ?? (request.headers['x-user-id'] as string | undefined);

export const profileController = {
  // Get user profile
  getProfile: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserId(request);
      
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const profile = await profileService.getProfile(userId);
      reply.send(profile);
    } catch (error) {
      loggerService.error('Error getting user profile:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error getting user profile' });
      }
    }
  },
  
  // Update user profile
  updateProfile: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserId(request);
      
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const data = request.body as ProfileUpdateRequestType;
      
      const updatedProfile = await profileService.updateProfile(userId, data);
      reply.send(updatedProfile);
    } catch (error) {
      loggerService.error('Error updating user profile:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error updating user profile' });
      }
    }
  },
  
  // Get user settings
  getSettings: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserId(request);
      
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const settings = await profileService.getSettings(userId);
      reply.send(settings);
    } catch (error) {
      loggerService.error('Error getting user settings:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error getting user settings' });
      }
    }
  },
  
  // Update user settings
  updateSettings: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = getUserId(request);
      
      if (!userId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const data = request.body as SettingsUpdateRequestType;
      
      const updatedSettings = await profileService.updateSettings(userId, data);
      reply.send(updatedSettings);
    } catch (error) {
      loggerService.error('Error updating user settings:', error);
      
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error updating user settings' });
      }
    }
  }
};

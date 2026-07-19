import { FastifyRequest, FastifyReply } from 'fastify';
import { tailscaleConfigService } from './tailscale-config.service';
import { TailscaleConfigRequestType } from './tailscale-config.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tailscaleConfigController = {
  // Get global Tailscale configuration
  getConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      try {
        const config = await tailscaleConfigService.getConfig();
        reply.send(config);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Tailscale configuration not found') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error fetching Tailscale configuration:', error);
      reply.status(500).send({ error: 'Failed to fetch Tailscale configuration' });
    }
  },
  
  // Create or update Tailscale configuration
  upsertConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as TailscaleConfigRequestType;
      
      try {
        const config = await tailscaleConfigService.upsertConfig(data);
        reply.status(201).send(config);
      } catch (error) {
        if (error instanceof Error) {
          reply.status(400).send({ error: error.message });
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error updating Tailscale configuration:', error);
      reply.status(500).send({ error: 'Failed to update Tailscale configuration' });
    }
  },
  
  // Delete Tailscale configuration
  deleteConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await tailscaleConfigService.deleteConfig();
      reply.send(result);
    } catch (error) {
      loggerService.error('Error deleting Tailscale configuration:', error);
      reply.status(500).send({ error: 'Failed to delete Tailscale configuration' });
    }
  },
  
  // Check if Tailscale is configured
  checkConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await tailscaleConfigService.checkConfig();
      reply.send(result);
    } catch (error) {
      loggerService.error('Error checking Tailscale configuration:', error);
      reply.status(500).send({ error: 'Failed to check Tailscale configuration' });
    }
  }
};

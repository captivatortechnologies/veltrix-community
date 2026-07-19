import { FastifyRequest, FastifyReply } from 'fastify';
import { tailscaleService } from './tailscale.service';
import { 
  TailscaleKeyRequestType, 
  TailscaleConfigRequestType 
} from './tailscale.schema';
import { loggerService } from '../../module/logger/logger.service';

export const tailscaleController = {
  // Check if Tailscale is configured
  checkConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await tailscaleService.checkConfig();
      reply.code(200).send(result);
    } catch (error) {
      loggerService.error('Error checking Tailscale configuration:', error);
      reply.code(500).send({ error: 'Failed to check Tailscale configuration' });
    }
  },
  
  // Get Tailscale configuration
  getConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await tailscaleService.getConfig();
      
      if (!config) {
        return reply.code(404).send({ error: 'Tailscale configuration not found' });
      }
      
      reply.send(config);
    } catch (error) {
      loggerService.error('Error fetching Tailscale configuration:', error);
      reply.code(500).send({ error: 'Failed to fetch Tailscale configuration' });
    }
  },
  
  // Create or update Tailscale configuration
  upsertConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = request.body as TailscaleConfigRequestType;
      
      if (!data.tailnet || !data.apiKey) {
        return reply.code(400).send({ error: 'Tailnet and API key are required' });
      }
      
      const config = await tailscaleService.upsertConfig(data);
      reply.code(201).send(config);
    } catch (error) {
      loggerService.error('Error updating Tailscale configuration:', error);
      reply.code(500).send({ error: 'Failed to update Tailscale configuration' });
    }
  },
  
  // Delete Tailscale configuration
  deleteConfig: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const success = await tailscaleService.deleteConfig();
      
      if (!success) {
        return reply.code(404).send({ error: 'Tailscale configuration not found' });
      }
      
      reply.send({ message: 'Tailscale configuration deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting Tailscale configuration:', error);
      reply.code(500).send({ error: 'Failed to delete Tailscale configuration' });
    }
  },
  
  // Get all Tailscale devices
  getAllDevices: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const devices = await tailscaleService.getAllDevices();
      reply.code(200).send(devices);
    } catch (error) {
      loggerService.error('Error fetching Tailscale devices:', error);
      reply.code(500).send({ error: 'Failed to fetch Tailscale devices' });
    }
  },
  
  // Get a Tailscale device by ID
  getDeviceById: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const device = await tailscaleService.getDeviceById(id);
      reply.code(200).send(device);
    } catch (error) {
      loggerService.error(`Error fetching Tailscale device with ID ${request.params.id}:`, error);
      reply.code(500).send({ error: `Failed to fetch Tailscale device with ID ${request.params.id}` });
    }
  },
  
  // Delete a Tailscale device
  deleteDevice: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const success = await tailscaleService.deleteDevice(id);
      reply.code(200).send({ success });
    } catch (error) {
      loggerService.error('Error deleting Tailscale device:', error);
      reply.code(500).send({ error: 'Failed to delete Tailscale device' });
    }
  },
  
  // Generate a Tailscale key
  generateKey: async (request: FastifyRequest<{ Body: TailscaleKeyRequestType }>, reply: FastifyReply) => {
    try {
      const data = request.body;
      const result = await tailscaleService.generateKey(data);
      reply.code(200).send(result);
    } catch (error) {
      loggerService.error('Error generating Tailscale key:', error);
      
      if (error instanceof Error) {
        reply.code(400).send({ error: error.message });
      } else {
        reply.code(500).send({ error: 'Failed to generate Tailscale key' });
      }
    }
  }
};

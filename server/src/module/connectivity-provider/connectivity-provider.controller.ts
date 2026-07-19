import { FastifyRequest, FastifyReply } from 'fastify';
import { connectivityProviderService } from './connectivity-provider.service';
import {
  CreateConnectivityProviderRequest,
  UpdateConnectivityProviderRequest
} from './connectivity-provider.schema';
import { loggerService } from '../../module/logger/logger.service';

export const connectivityProviderController = {
  // List all connectivity providers for the authenticated customer
  list: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const providers = await connectivityProviderService.listProviders(customerId);
      reply.send(providers);
    } catch (error) {
      loggerService.error('Error listing connectivity providers:', error);
      reply.status(500).send({ error: 'Failed to list connectivity providers' });
    }
  },

  // Get a single connectivity provider
  get: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const { id } = request.params as { id: string };

      try {
        const provider = await connectivityProviderService.getProvider(id, customerId);
        reply.send(provider);
      } catch (error) {
        if (error instanceof Error && error.message === 'Connectivity provider not found') {
          reply.status(404).send({ error: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error fetching connectivity provider:', error);
      reply.status(500).send({ error: 'Failed to fetch connectivity provider' });
    }
  },

  // Create a new connectivity provider
  create: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const data = request.body as CreateConnectivityProviderRequest;

      try {
        const provider = await connectivityProviderService.createProvider(customerId, data);
        reply.status(201).send(provider);
      } catch (error) {
        if (error instanceof Error) {
          reply.status(400).send({ error: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error creating connectivity provider:', error);
      reply.status(500).send({ error: 'Failed to create connectivity provider' });
    }
  },

  // Update an existing connectivity provider
  update: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const { id } = request.params as { id: string };
      const data = request.body as UpdateConnectivityProviderRequest;

      try {
        const provider = await connectivityProviderService.updateProvider(id, customerId, data);
        reply.send(provider);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Connectivity provider not found') {
            reply.status(404).send({ error: error.message });
          } else {
            reply.status(400).send({ error: error.message });
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error updating connectivity provider:', error);
      reply.status(500).send({ error: 'Failed to update connectivity provider' });
    }
  },

  // Delete a connectivity provider
  delete: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const { id } = request.params as { id: string };

      try {
        const result = await connectivityProviderService.deleteProvider(id, customerId);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message === 'Connectivity provider not found') {
          reply.status(404).send({ error: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error deleting connectivity provider:', error);
      reply.status(500).send({ error: 'Failed to delete connectivity provider' });
    }
  },

  // Set a provider as the default for the customer
  setDefault: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const { id } = request.params as { id: string };

      try {
        const provider = await connectivityProviderService.setDefault(id, customerId);
        reply.send(provider);
      } catch (error) {
        if (error instanceof Error && error.message === 'Connectivity provider not found') {
          reply.status(404).send({ error: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error setting default connectivity provider:', error);
      reply.status(500).send({ error: 'Failed to set default connectivity provider' });
    }
  },

  // Test a provider's connection
  testConnection: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user!.customerId;
      const { id } = request.params as { id: string };

      try {
        const result = await connectivityProviderService.testConnection(id, customerId);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message === 'Connectivity provider not found') {
          reply.status(404).send({ error: error.message });
        } else {
          throw error;
        }
      }
    } catch (error) {
      loggerService.error('Error testing connectivity provider connection:', error);
      reply.status(500).send({ error: 'Failed to test connectivity provider connection' });
    }
  }
};

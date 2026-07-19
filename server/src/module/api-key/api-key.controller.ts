import { FastifyRequest, FastifyReply } from 'fastify';
import { apiKeyService, ApiKeyValidationError } from './api-key.service';
import { 
  AuthenticatedRequest, 
  CreateApiKeyType, 
  UpdateApiKeyType,
  RegenerateApiKeyType,
  ApiKeyParamsType 
} from './api-key.schema';
import { loggerService } from '../../module/logger/logger.service';

export const apiKeyController = {
  // Get all API keys for the customer
  getAllApiKeys: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const apiKeys = await apiKeyService.getAllApiKeys(customerId);
      reply.send(apiKeys);
    } catch (error) {
      loggerService.error('Error fetching API keys:', error);
      reply.status(500).send({ error: 'Error fetching API keys' });
    }
  },
  
  // Get a specific API key by ID
  getApiKeyById: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const { id } = request.params as ApiKeyParamsType;
      
      const apiKey = await apiKeyService.getApiKeyById(customerId, id);
      
      if (!apiKey) {
        return reply.status(404).send({ error: 'API key not found' });
      }
      
      reply.send(apiKey);
    } catch (error) {
      loggerService.error('Error fetching API key:', error);
      reply.status(500).send({ error: 'Error fetching API key' });
    }
  },
  
  // Create a new API key
  createApiKey: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const data = request.body as CreateApiKeyType;
      
      const apiKey = await apiKeyService.createApiKey(customerId, data);
      reply.status(201).send(apiKey);
    } catch (error) {
      if (error instanceof ApiKeyValidationError) {
        return reply.status(400).send({ error: error.message });
      }
      loggerService.error('Error creating API key:', error);
      reply.status(500).send({ error: 'Error creating API key' });
    }
  },
  
  // Update an API key
  updateApiKey: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const { id } = request.params as ApiKeyParamsType;
      const data = request.body as UpdateApiKeyType;
      
      const apiKey = await apiKeyService.updateApiKey(customerId, id, data);
      
      if (!apiKey) {
        return reply.status(404).send({ error: 'API key not found' });
      }
      
      reply.send(apiKey);
    } catch (error) {
      loggerService.error('Error updating API key:', error);
      reply.status(500).send({ error: 'Error updating API key' });
    }
  },
  
  // Regenerate an API key
  regenerateApiKey: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const { id } = request.params as ApiKeyParamsType;
      const options = request.body as RegenerateApiKeyType;
      
      const apiKey = await apiKeyService.regenerateApiKey(customerId, id, options);
      
      if (!apiKey) {
        return reply.status(404).send({ error: 'API key not found' });
      }
      
      reply.send(apiKey);
    } catch (error) {
      loggerService.error('Error regenerating API key:', error);
      reply.status(500).send({ error: 'Error regenerating API key' });
    }
  },
  
  // Revoke an API key
  revokeApiKey: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const { id } = request.params as ApiKeyParamsType;
      
      const apiKey = await apiKeyService.revokeApiKey(customerId, id);
      
      if (!apiKey) {
        return reply.status(404).send({ error: 'API key not found' });
      }
      
      reply.send(apiKey);
    } catch (error) {
      loggerService.error('Error revoking API key:', error);
      reply.status(500).send({ error: 'Error revoking API key' });
    }
  },
  
  // Delete an API key
  deleteApiKey: async (request: FastifyRequest & AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const customerId = request.user.customerId;
      const { id } = request.params as ApiKeyParamsType;
      
      const success = await apiKeyService.deleteApiKey(customerId, id);
      
      if (!success) {
        return reply.status(404).send({ error: 'API key not found' });
      }
      
      reply.status(204).send();
    } catch (error) {
      loggerService.error('Error deleting API key:', error);
      reply.status(500).send({ error: 'Error deleting API key' });
    }
  }
};

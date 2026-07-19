import { FastifyRequest, FastifyReply } from 'fastify';
import { customerToolService } from './customer-tool.service';
import { 
  CustomerIdParamsType, 
  CustomerToolParamsType,
  AddToolBodyType
} from './customer-tool.schema';
import { loggerService } from '../../module/logger/logger.service';

export const customerToolController = {
  // Get all tools configured by a specific customer
  getCustomerTools: async (request: FastifyRequest<{ Params: CustomerIdParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId } = request.params;
      
      try {
        const tools = await customerToolService.getCustomerTools(customerId);
        reply.status(200).send(tools);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Customer not found') {
            reply.status(404).send({ message: error.message });
          } else {
            reply.status(400).send({ message: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error fetching customer tools:', error);
      reply.status(500).send({ message: 'Internal server error' });
    }
  },
  
  // Add a tool to a customer's configured tools
  addCustomerTool: async (request: FastifyRequest<{ Params: CustomerIdParamsType, Body: AddToolBodyType }>, reply: FastifyReply) => {
    try {
      const { customerId } = request.params;
      const data = request.body;
      
      try {
        const tool = await customerToolService.addCustomerTool(customerId, data);
        reply.status(201).send(tool);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Customer not found' || error.message === 'Tool not found') {
            reply.status(404).send({ message: error.message });
          } else if (error.message === 'Tool already configured for this customer') {
            reply.status(409).send({ message: error.message });
          } else {
            reply.status(400).send({ message: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error adding customer tool:', error);
      reply.status(500).send({ message: 'Internal server error' });
    }
  },
  
  // Remove a tool from a customer's configured tools
  removeCustomerTool: async (request: FastifyRequest<{ Params: CustomerToolParamsType }>, reply: FastifyReply) => {
    try {
      const { customerId, toolId } = request.params;
      
      try {
        const result = await customerToolService.removeCustomerTool(customerId, toolId);
        reply.status(200).send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Customer not found' || error.message === 'Tool not found' || error.message === 'Tool not configured for this customer') {
            reply.status(404).send({ message: error.message });
          } else {
            reply.status(400).send({ message: error.message });
          }
        } else {
          throw error; // Re-throw if it's not an Error instance
        }
      }
    } catch (error) {
      loggerService.error('Error removing customer tool:', error);
      reply.status(500).send({ message: 'Internal server error' });
    }
  }
};

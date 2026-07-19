import { FastifyRequest, FastifyReply } from 'fastify';
import { logForwardingService } from './log-forwarding.service';
import { 
  LogForwardingCreateRequestType, 
  LogForwardingUpdateRequestType,
  LogForwardingIdParamsType
} from './log-forwarding.schema';
import { loggerService } from '../../module/logger/logger.service';

// Using the FastifyRequest with user property defined in auth.middleware.ts

export const logForwardingController = {
  // Get all log forwarding destinations for the customer
  getAllDestinations: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const customerId = request.user.customerId;
      
      const destinations = await logForwardingService.getAllDestinations(customerId);
      reply.send(destinations);
    } catch (error) {
      loggerService.error('Error fetching log forwarding destinations:', error);
      reply.status(500).send({ error: 'Error fetching log forwarding destinations' });
    }
  },
  
  // Create a new log forwarding destination
  createDestination: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const customerId = request.user.customerId;
      const data = request.body as LogForwardingCreateRequestType;
      
      const destination = await logForwardingService.createDestination(data, customerId);
      reply.status(201).send(destination);
    } catch (error) {
      loggerService.error('Error creating log forwarding destination:', error);
      
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error creating log forwarding destination' });
      }
    }
  },
  
  // Update a log forwarding destination
  updateDestination: async (request: FastifyRequest<{ Params: LogForwardingIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const customerId = request.user.customerId;
      const { id } = request.params;
      const data = request.body as LogForwardingUpdateRequestType;
      
      const updatedDestination = await logForwardingService.updateDestination(id, data, customerId);
      reply.send(updatedDestination);
    } catch (error) {
      loggerService.error('Error updating log forwarding destination:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Log forwarding destination not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error updating log forwarding destination' });
      }
    }
  },
  
  // Delete a log forwarding destination
  deleteDestination: async (request: FastifyRequest<{ Params: LogForwardingIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const customerId = request.user.customerId;
      const { id } = request.params;
      
      await logForwardingService.deleteDestination(id, customerId);
      reply.send({ message: 'Log forwarding destination deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting log forwarding destination:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Log forwarding destination not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting log forwarding destination' });
      }
    }
  },
  
  // Test a log forwarding destination
  testDestination: async (request: FastifyRequest<{ Params: LogForwardingIdParamsType }>, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      
      const customerId = request.user.customerId;
      const { id } = request.params;
      
      const result = await logForwardingService.testDestination(id, customerId);
      reply.send(result);
    } catch (error) {
      loggerService.error('Error testing log forwarding destination:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Log forwarding destination not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error testing log forwarding destination' });
      }
    }
  }
};

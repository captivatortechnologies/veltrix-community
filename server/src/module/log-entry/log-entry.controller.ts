import { FastifyRequest, FastifyReply } from 'fastify';
import { logEntryService } from './log-entry.service';
import { 
  LogEntryCreateRequestType, 
  LogEntryQueryParamsType,
  LogEntryIdParamsType
} from './log-entry.schema';
import { loggerService } from '../../module/logger/logger.service';

export const logEntryController = {
  // Get all log entries with pagination and filtering
  getAllLogEntries: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      // Get query parameters
      const queryParams = request.query as LogEntryQueryParamsType;
      
      // Get log entries with pagination
      const { logEntries, totalCount, pageNum, limitNum } = await logEntryService.getAllLogEntries(customerId, queryParams);
      
      // Set pagination headers
      reply.header('X-Total-Count', totalCount.toString());
      reply.header('X-Total-Pages', Math.ceil(totalCount / limitNum).toString());
      reply.header('X-Current-Page', pageNum.toString());
      
      reply.send(logEntries);
    } catch (error) {
      loggerService.error('Error fetching log entries:', error);
      reply.status(500).send({ error: 'Error fetching log entries' });
    }
  },
  
  // Get log entry by ID
  getLogEntryById: async (request: FastifyRequest<{ Params: LogEntryIdParamsType }>, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      const { id } = request.params;
      
      const logEntry = await logEntryService.getLogEntryById(id, customerId);
      
      if (!logEntry) {
        return reply.status(404).send({ error: 'Log entry not found' });
      }
      
      reply.send(logEntry);
    } catch (error) {
      loggerService.error('Error fetching log entry:', error);
      reply.status(500).send({ error: 'Error fetching log entry' });
    }
  },
  
  // Create a new log entry
  createLogEntry: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      const data = request.body as LogEntryCreateRequestType;
      
      const logEntry = await logEntryService.createLogEntry(data, customerId);
      reply.status(201).send(logEntry);
    } catch (error) {
      loggerService.error('Error creating log entry:', error);
      
      if (error instanceof Error) {
        reply.status(400).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error creating log entry' });
      }
    }
  },
  
  // Delete a log entry
  deleteLogEntry: async (request: FastifyRequest<{ Params: LogEntryIdParamsType }>, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      const { id } = request.params;
      
      await logEntryService.deleteLogEntry(id, customerId);
      reply.send({ message: 'Log entry deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting log entry:', error);
      
      if (error instanceof Error) {
        if (error.message === 'Log entry not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(400).send({ error: error.message });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting log entry' });
      }
    }
  },
  
  // Get log sources for filtering
  getLogSources: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      const sources = await logEntryService.getLogSources(customerId);
      reply.send(sources);
    } catch (error) {
      loggerService.error('Error fetching log sources:', error);
      reply.status(500).send({ error: 'Error fetching log sources' });
    }
  },
  
  // Get log levels for filtering
  getLogLevels: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get customer ID from headers (set by middleware)
      const customerId = request.headers['x-customer-id'] as string;
      
      if (!customerId) {
        return reply.status(400).send({ error: 'Customer ID is required' });
      }
      
      const levels = await logEntryService.getLogLevels(customerId);
      reply.send(levels);
    } catch (error) {
      loggerService.error('Error fetching log levels:', error);
      reply.status(500).send({ error: 'Error fetching log levels' });
    }
  }
};

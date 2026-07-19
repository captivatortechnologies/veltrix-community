import { FastifyInstance } from 'fastify';
import { logEntryController } from './log-entry.controller';
import { verifyToken, hasPermission } from '../../middlewares/authMiddleware';
import { extractCustomerId } from '../../middlewares/customerMiddleware';
import {
  logEntrySchema,
  logEntryCreateSchema,
  logEntryQuerySchema,
  errorSchema,
  successMessageSchema
} from './log-entry.schema';

export async function logEntryRoutes(fastify: FastifyInstance) {
  // Get all log entries with pagination and filtering
  fastify.get('/logs', {
    schema: {
      tags: ['logEntries'],
      summary: 'Get all log entries',
      description: 'Returns a list of all log entries with pagination and filtering',
      querystring: logEntryQuerySchema,
      response: {
        200: {
          type: 'array',
          items: logEntrySchema
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'read')],
    handler: logEntryController.getAllLogEntries
  });
  
  // Get log entry by ID
  fastify.get('/logs/:id', {
    schema: {
      tags: ['logEntries'],
      summary: 'Get log entry by ID',
      description: 'Returns a specific log entry by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Log entry ID' }
        }
      },
      response: {
        200: logEntrySchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'read')],
    handler: logEntryController.getLogEntryById
  });
  
  // Create a new log entry
  fastify.post('/logs', {
    schema: {
      tags: ['logEntries'],
      summary: 'Create a new log entry',
      description: 'Creates a new log entry',
      body: logEntryCreateSchema,
      response: {
        201: logEntrySchema,
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'write')],
    handler: logEntryController.createLogEntry
  });
  
  // Delete a log entry
  fastify.delete('/logs/:id', {
    schema: {
      tags: ['logEntries'],
      summary: 'Delete a log entry',
      description: 'Deletes a log entry',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Log entry ID' }
        }
      },
      response: {
        200: successMessageSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'write')],
    handler: logEntryController.deleteLogEntry
  });
  
  // Get log sources for filtering
  fastify.get('/logs/sources', {
    schema: {
      tags: ['logEntries'],
      summary: 'Get log sources',
      description: 'Returns a list of unique log sources for filtering',
      response: {
        200: {
          type: 'array',
          items: { type: 'string' }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'read')],
    handler: logEntryController.getLogSources
  });
  
  // Get log levels for filtering
  fastify.get('/logs/levels', {
    schema: {
      tags: ['logEntries'],
      summary: 'Get log levels',
      description: 'Returns a list of unique log levels for filtering',
      response: {
        200: {
          type: 'array',
          items: { 
            type: 'string',
            enum: ['info', 'warn', 'error', 'debug']
          }
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema
      }
    },
    preHandler: [verifyToken, extractCustomerId, hasPermission('logEntry', 'read')],
    handler: logEntryController.getLogLevels
  });
}

export default logEntryRoutes;

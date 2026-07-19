import { ConfigActionType } from '@prisma/client'; // Assuming this will be generated
import { Prisma } from '@prisma/client';

// Schema for creating a history entry (used in service/controller)
export const createHistoryEntrySchema = {
  type: 'object',
  properties: {
    action: { 
      type: 'string', 
      enum: Object.values(ConfigActionType) // Use enum values for validation
    },
    entityType: { type: 'string' },
    entityId: { type: 'string' },
    entityName: { type: 'string', nullable: true },
    details: { type: 'object', additionalProperties: true, nullable: true }, // Allow any JSON object
    // userId and customerId are typically added from request context, not body
  },
  required: ['action', 'entityType', 'entityId']
};

// Schema for the response when getting history entries
export const historyEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    timestamp: { type: 'string', format: 'date-time' },
    action: { type: 'string', enum: Object.values(ConfigActionType) },
    entityType: { type: 'string' },
    entityId: { type: 'string' },
    entityName: { type: 'string', nullable: true },
    details: { type: 'object', additionalProperties: true, nullable: true },
    userId: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    user: { // Include basic user info
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string', nullable: true }
      }
    }
  }
};

// Schema for the response when getting a list of history entries
export const getHistoryResponseSchema = {
  type: 'array',
  items: historyEntrySchema
};

// Log Entry types and interfaces

// Log entry level types
export type LogEntryLevelType = 'info' | 'warn' | 'error' | 'debug';

// Log entry create request
export interface LogEntryCreateRequestType {
  level: LogEntryLevelType;
  source: string;
  message: string;
  details?: string;
}

// Log entry query params
export interface LogEntryQueryParamsType {
  page?: string;
  limit?: string;
  level?: LogEntryLevelType;
  source?: string;
  fromDate?: string;
  toDate?: string;
}

// Log entry response
export interface LogEntryResponseType {
  id: string;
  timestamp: Date;
  level: LogEntryLevelType;
  source: string;
  message: string;
  details: string | null;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Request params
export interface LogEntryIdParamsType {
  id: string;
}

// Swagger schemas
export const logEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    timestamp: { type: 'string', format: 'date-time' },
    level: { 
      type: 'string', 
      enum: ['info', 'warn', 'error', 'debug'] 
    },
    source: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'string', nullable: true },
    customerId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const logEntryCreateSchema = {
  type: 'object',
  required: ['level', 'source', 'message'],
  properties: {
    level: { 
      type: 'string', 
      enum: ['info', 'warn', 'error', 'debug'] 
    },
    source: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'string' }
  }
};

export const logEntryQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'string', pattern: '^[0-9]+$' },
    limit: { type: 'string', pattern: '^[0-9]+$' },
    level: { 
      type: 'string', 
      enum: ['info', 'warn', 'error', 'debug'] 
    },
    source: { type: 'string' },
    fromDate: { type: 'string', format: 'date-time' },
    toDate: { type: 'string', format: 'date-time' }
  }
};

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

export const successMessageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
};

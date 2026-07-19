// Log Forwarding types and interfaces

// Log forwarding destination types
export type LogForwardingDestinationType = 'splunk' | 'elasticsearch' | 'datadog' | 'sumologic' | 'custom';
export type LogForwardingStatusType = 'active' | 'inactive' | 'error';

// Log forwarding destination create request
export interface LogForwardingCreateRequestType {
  name: string;
  type: LogForwardingDestinationType;
  endpoint: string;
}

// Log forwarding destination update request
export interface LogForwardingUpdateRequestType {
  name?: string;
  type?: LogForwardingDestinationType;
  endpoint?: string;
  status?: LogForwardingStatusType;
}

// Log forwarding destination response
export interface LogForwardingResponseType {
  id: string;
  name: string;
  type: LogForwardingDestinationType;
  endpoint: string;
  status: LogForwardingStatusType;
  error: string | null;
  lastSync: Date | null;
  customerId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Request params
export interface LogForwardingIdParamsType {
  id: string;
}

// Swagger schemas
export const logForwardingDestinationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    type: { 
      type: 'string', 
      enum: ['splunk', 'elasticsearch', 'datadog', 'sumologic', 'custom'] 
    },
    endpoint: { type: 'string' },
    status: { 
      type: 'string', 
      enum: ['active', 'inactive', 'error'] 
    },
    error: { type: 'string', nullable: true },
    lastSync: { type: 'string', format: 'date-time', nullable: true },
    customerId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const logForwardingCreateSchema = {
  type: 'object',
  required: ['name', 'type', 'endpoint'],
  properties: {
    name: { type: 'string' },
    type: { 
      type: 'string', 
      enum: ['splunk', 'elasticsearch', 'datadog', 'sumologic', 'custom'] 
    },
    endpoint: { type: 'string' }
  }
};

export const logForwardingUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { 
      type: 'string', 
      enum: ['splunk', 'elasticsearch', 'datadog', 'sumologic', 'custom'] 
    },
    endpoint: { type: 'string' },
    status: { 
      type: 'string', 
      enum: ['active', 'inactive', 'error'] 
    }
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

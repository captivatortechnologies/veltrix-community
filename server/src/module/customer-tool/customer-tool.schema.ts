// Customer Tool types and interfaces

// Customer ID params
export interface CustomerIdParamsType {
  customerId: string;
}

// Customer Tool params
export interface CustomerToolParamsType {
  customerId: string;
  toolId: string;
}

// Add Tool body
export interface AddToolBodyType {
  toolId: string;
}

// Tool response
export interface ToolResponseType {
  id: string;
  name: string;
  description: string;
  vendor: string;
  logoUrl: string | null;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Customer Tool response
export interface CustomerToolResponseType {
  id: string;
  customerId: string;
  toolId: string;
  createdAt: Date;
  updatedAt: Date;
  tool: ToolResponseType;
}

// Success message response
export interface SuccessMessageType {
  message: string;
}

// Swagger schemas
export const toolSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string' },
    vendor: { type: 'string' },
    logoUrl: { type: 'string', nullable: true },
    category: { type: 'string' },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const addToolBodySchema = {
  type: 'object',
  required: ['toolId'],
  properties: {
    toolId: { type: 'string', format: 'uuid', description: 'Tool ID' }
  }
};

export const successMessageSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
};

export const errorSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
};

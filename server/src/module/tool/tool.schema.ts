// Tool types and interfaces

// Tool create request
export interface ToolCreateRequestType {
  name: string;
  description: string;
  vendor: string;
  logoUrl?: string;
  category: string;
  customerId?: string;
}

// Tool update request
export interface ToolUpdateRequestType {
  name?: string;
  description?: string;
  vendor?: string;
  logoUrl?: string;
  category?: string;
  isActive?: boolean;
  customerId?: string;
}

// Tool query params
export interface ToolQueryParamsType {
  vendor?: string;
  category?: string;
  search?: string;
  customerId?: string;
}

// Integration response
export interface IntegrationResponseType {
  id: string;
  status: string;
  lastSync: Date | null;
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
  integrations?: IntegrationResponseType[];
}

// Request params
export interface ToolIdParamsType {
  id: string;
}

// Swagger schemas
export const integrationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string' },
    lastSync: { type: 'string', format: 'date-time', nullable: true }
  }
};

export const toolSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
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

export const toolWithIntegrationsSchema = {
  type: 'object',
  properties: {
    ...toolSchema.properties,
    integrations: {
      type: 'array',
      items: integrationSchema
    }
  }
};

export const toolCreateSchema = {
  type: 'object',
  required: ['name', 'description', 'vendor', 'category'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    vendor: { type: 'string' },
    logoUrl: { type: 'string', nullable: true },
    category: { type: 'string' },
    customerId: { type: 'string', format: 'uuid', nullable: true }
  }
};

export const toolUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    vendor: { type: 'string' },
    logoUrl: { type: 'string', nullable: true },
    category: { type: 'string' },
    isActive: { type: 'boolean' },
    customerId: { type: 'string', format: 'uuid', nullable: true }
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

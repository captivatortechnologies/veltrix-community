// Tailscale Config types and interfaces

// Tailscale Config request
export interface TailscaleConfigRequestType {
  apiUrl?: string;
  tailnet: string;
  apiKey: string;
}

// Tailscale Config response
export interface TailscaleConfigResponseType {
  id: string;
  apiUrl: string;
  tailnet: string;
  apiKeyConfigured?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Tailscale Config check response
export interface TailscaleConfigCheckResponseType {
  configured: boolean;
  apiUrl: string | null;
  tailnet: string | null;
}

// Success message response
export interface SuccessMessageType {
  message: string;
}

// Swagger schemas
export const tailscaleConfigSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    apiUrl: { type: 'string' },
    tailnet: { type: 'string' },
    apiKeyConfigured: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const tailscaleConfigRequestSchema = {
  type: 'object',
  required: ['tailnet', 'apiKey'],
  properties: {
    apiUrl: { type: 'string' },
    tailnet: { type: 'string' },
    apiKey: { type: 'string' }
  }
};

export const tailscaleConfigCheckSchema = {
  type: 'object',
  properties: {
    configured: { type: 'boolean' },
    apiUrl: { type: 'string', nullable: true },
    tailnet: { type: 'string', nullable: true }
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
    error: { type: 'string' }
  }
};

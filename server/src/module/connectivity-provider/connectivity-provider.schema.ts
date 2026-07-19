// Connectivity Provider types and interfaces

export const PROVIDER_TYPES = [
  'tailscale',
  'ssh',
  'wireguard',
  'cloudflare_tunnel',
  'zerotier',
  'nebula',
  'openvpn',
  'aws_ssm',
  'hashicorp_boundary'
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export type ProviderStatus = 'UNCONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';

// Response type — sensitive config fields are masked before returning
export interface ConnectivityProviderType {
  id: string;
  customerId: string;
  providerType: ProviderType;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  config: Record<string, unknown>;
  status: ProviderStatus;
  statusMessage: string | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Request body for creating a new provider
export interface CreateConnectivityProviderRequest {
  providerType: ProviderType;
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
}

// Request body for updating an existing provider
export interface UpdateConnectivityProviderRequest {
  name?: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
}

// Response from a test-connection call
export interface TestConnectionResponse {
  success: boolean;
  message: string;
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Swagger / JSON-schema shapes
// ---------------------------------------------------------------------------

export const connectivityProviderSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    customerId: { type: 'string', format: 'uuid' },
    providerType: { type: 'string', enum: [...PROVIDER_TYPES] },
    name: { type: 'string' },
    isDefault: { type: 'boolean' },
    isEnabled: { type: 'boolean' },
    config: { type: 'object', additionalProperties: true },
    status: { type: 'string', enum: ['UNCONFIGURED', 'CONFIGURED', 'CONNECTED', 'ERROR'] },
    statusMessage: { type: 'string', nullable: true },
    lastTestedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const connectivityProviderListSchema = {
  type: 'array',
  items: connectivityProviderSchema
};

export const createConnectivityProviderRequestSchema = {
  type: 'object',
  required: ['providerType', 'name', 'config'],
  properties: {
    providerType: { type: 'string', enum: [...PROVIDER_TYPES] },
    name: { type: 'string', minLength: 1 },
    config: { type: 'object', additionalProperties: true },
    isDefault: { type: 'boolean' }
  }
};

export const updateConnectivityProviderRequestSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    config: { type: 'object', additionalProperties: true },
    isEnabled: { type: 'boolean' }
  }
};

export const testConnectionResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    latencyMs: { type: 'number', nullable: true }
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

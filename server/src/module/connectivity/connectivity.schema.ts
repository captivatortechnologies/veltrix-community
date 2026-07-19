// Connectivity types and interfaces

// Connectivity create request
export interface ConnectivityCreateRequestType {
  componentId: string;
  status?: string;
  sshCommand?: string;
  httpsUrl?: string;
}

// Connectivity update request
export interface ConnectivityUpdateRequestType {
  status?: string;
  sshCommand?: string;
  httpsUrl?: string;
  tailscaleKey?: string;
  tailscaleDeviceId?: string;
  tailscaleDeviceIP?: string;
}

// Connectivity response
export interface ConnectivityResponseType {
  id: string;
  componentId: string;
  status: string;
  sshCommand: string | null;
  httpsUrl: string | null;
  tailscaleKey: string | null;
  tailscaleDeviceId: string | null;
  tailscaleDeviceIP: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Component ID params
export interface ComponentIdParamsType {
  componentId: string;
}

// Swagger schemas
export const connectivitySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    componentId: { type: 'string', format: 'uuid' },
    status: { type: 'string' },
    sshCommand: { type: 'string', nullable: true },
    httpsUrl: { type: 'string', nullable: true },
    tailscaleKey: { type: 'string', nullable: true },
    tailscaleDeviceId: { type: 'string', nullable: true },
    tailscaleDeviceIP: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

export const connectivityCreateSchema = {
  type: 'object',
  required: ['componentId'],
  properties: {
    componentId: { type: 'string', format: 'uuid' },
    status: { type: 'string' },
    sshCommand: { type: 'string' },
    httpsUrl: { type: 'string' }
  }
};

export const connectivityUpdateSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    sshCommand: { type: 'string' },
    httpsUrl: { type: 'string' },
    tailscaleKey: { type: 'string' },
    tailscaleDeviceId: { type: 'string' },
    tailscaleDeviceIP: { type: 'string' }
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

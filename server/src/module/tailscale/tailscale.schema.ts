// Tailscale types and interfaces

// Tailscale key request
export interface TailscaleKeyRequestType {
  componentId: string;
  description: string;
  customerId: string;
  reusable?: boolean;
  ephemeral?: boolean;
  tags?: string[];
}

// Tailscale config request
export interface TailscaleConfigRequestType {
  apiUrl?: string;
  tailnet: string;
  apiKey: string;
}

// Tailscale config response
export interface TailscaleConfigResponseType {
  id: string;
  apiUrl: string;
  tailnet: string;
  createdAt: Date;
  updatedAt: Date;
  apiKeyConfigured?: boolean;
}

// Tailscale device
export interface TailscaleDeviceType {
  id: string;
  name?: string;
  hostname?: string;
  addresses?: string[];
  os?: string;
  lastSeen?: string;
  [key: string]: any; // For other properties returned by the API
}

// Tailscale connectivity
export interface TailscaleConnectivityType {
  id: string;
  componentId: string;
  status: string;
  tailscaleKey: string | null;
  tailscaleDeviceId?: string | null;
  tailscaleDeviceIp?: string | null;
  sshCommand: string | null;
  httpsUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  installCommands?: string;
}

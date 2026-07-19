import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Tailscale data structures
interface TailscaleDevice {
  id: string;
  name: string;
  hostname: string;
  user: string;
  addresses: string[];
  clientVersion: string;
  os: string;
  created: string; // ISO Date string
  lastSeen: string; // ISO Date string
  isOnline: boolean;
  tags?: string[];
}

interface TailscaleConfig {
    id: string;
    apiUrl: string;
    tailnet: string;
    apiKey: string; // Masked or omitted in responses usually
    enabled: boolean;
    createdAt: string; // ISO Date string
    updatedAt: string; // ISO Date string
}

interface GetConfigResponse {
    isConfigured: boolean;
    config?: TailscaleConfig | null;
}

interface GenerateKeyPayload {
    componentId: string; // uuid
    description: string;
    customerId: string; // uuid
    reusable?: boolean;
    ephemeral?: boolean;
    tags?: string[];
}

interface GenerateKeyResponse {
    key: string;
    expiresAt: string; // ISO Date string
}

export class TailscaleResource extends BaseResource {
  protected readonly RESOURCE_PATH = "tailscale";

  async getConfig(config?: AxiosRequestConfig): Promise<GetConfigResponse> {
    // Corresponds to GET /api/tailscale/config
    const path = `${this.RESOURCE_PATH}/config`;
    return this.httpClient.get<GetConfigResponse>(path, config);
  }

  async listDevices(config?: AxiosRequestConfig): Promise<TailscaleDevice[]> {
    // Corresponds to GET /api/tailscale/devices
    const path = `${this.RESOURCE_PATH}/devices`;
    return this.httpClient.get<TailscaleDevice[]>(path, config);
  }

  async getDevice(deviceId: string, config?: AxiosRequestConfig): Promise<TailscaleDevice> {
    // Corresponds to GET /api/tailscale/devices/{id}
    const path = `${this.RESOURCE_PATH}/devices/${deviceId}`;
    return this.httpClient.get<TailscaleDevice>(path, config);
  }

  async generateKey(payload: GenerateKeyPayload, config?: AxiosRequestConfig): Promise<GenerateKeyResponse> {
    // Corresponds to POST /api/tailscale/keys
    const path = `${this.RESOURCE_PATH}/keys`;
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.post<GenerateKeyResponse>(path, cleanedPayload, config);
  }

  async deleteDevice(deviceId: string, config?: AxiosRequestConfig): Promise<null> {
    // Corresponds to DELETE /api/tailscale/device/{id}
    // Note singular 'device' in path
    const path = `${this.RESOURCE_PATH}/device/${deviceId}`;
    // API Spec indicates 204 No Content
    return this.httpClient.delete<null>(path, config);
  }

  // --- Global Config Methods (Admin Only) ---

  async getGlobalConfig(config?: AxiosRequestConfig): Promise<TailscaleConfig> {
    // Corresponds to GET /api/tailscale/global-config
    const path = `${this.RESOURCE_PATH}/global-config`;
    return this.httpClient.get<TailscaleConfig>(path, config);
  }

  async setGlobalConfig(payload: { tailnet: string; apiKey: string; apiUrl?: string }, config?: AxiosRequestConfig): Promise<TailscaleConfig> {
    // Corresponds to POST /api/tailscale/global-config
    const path = `${this.RESOURCE_PATH}/global-config`;
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.post<TailscaleConfig>(path, cleanedPayload, config);
  }

  async deleteGlobalConfig(config?: AxiosRequestConfig): Promise<null> {
    // Corresponds to DELETE /api/tailscale/global-config
    // API Spec indicates 204 No Content
    const path = `${this.RESOURCE_PATH}/global-config`;
    return this.httpClient.delete<null>(path, config);
  }
}

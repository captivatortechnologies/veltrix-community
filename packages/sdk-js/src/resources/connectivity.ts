import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Define interfaces for Connectivity data structures
interface ConnectivityDetails {
  id: string; // uuid
  componentId: string; // uuid
  status?: string | null;
  sshCommand?: string | null;
  httpsUrl?: string | null;
  tailscaleKey?: string | null; // Usually masked or omitted on GET
  tailscaleDeviceId?: string | null;
  tailscaleDeviceIP?: string | null;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface CreateOrUpdateConnectivityPayload {
  componentId: string; // uuid
  status?: string | null;
  sshCommand?: string | null;
  httpsUrl?: string | null;
}

interface UpdateConnectivityPayload {
  status?: string | null;
  sshCommand?: string | null;
  httpsUrl?: string | null;
  tailscaleKey?: string | null;
  tailscaleDeviceId?: string | null;
  tailscaleDeviceIP?: string | null;
}

export class ConnectivityResource extends BaseResource {
  protected readonly RESOURCE_PATH = "connectivity";

  async getForComponent(componentId: string, config?: AxiosRequestConfig): Promise<ConnectivityDetails> {
    // Corresponds to GET /api/connectivity/component/{componentId}
    const path = `${this.RESOURCE_PATH}/component/${componentId}`;
    return this.httpClient.get<ConnectivityDetails>(path, config);
  }

  async updateForComponent(componentId: string, payload: UpdateConnectivityPayload, config?: AxiosRequestConfig): Promise<ConnectivityDetails> {
    // Corresponds to PUT /api/connectivity/component/{componentId}
    const path = `${this.RESOURCE_PATH}/component/${componentId}`;
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.put<ConnectivityDetails>(path, cleanedPayload, config);
  }

  async deleteForComponent(componentId: string, config?: AxiosRequestConfig): Promise<{ message: string }> {
    // Corresponds to DELETE /api/connectivity/component/{componentId}
    // API Spec indicates 200 OK with message
    const path = `${this.RESOURCE_PATH}/component/${componentId}`;
    // Use http_client directly as base delete expects 204
     const result = await this.httpClient.delete<{ message: string } | null>(path, config);
     if (result === null) {
         throw new APIError(`DELETE ${path} returned null/204, expected 200 with message.`);
     }
     return result;
  }

  async createOrUpdate(payload: CreateOrUpdateConnectivityPayload, config?: AxiosRequestConfig): Promise<ConnectivityDetails> {
    // Corresponds to POST /api/connectivity/
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    // Uses base path POST
    return this._create<ConnectivityDetails>(cleanedPayload, undefined, config);
  }

  async regenerateKey(componentId: string, config?: AxiosRequestConfig): Promise<ConnectivityDetails> {
    // Corresponds to POST /api/connectivity/component/{componentId}/regenerate-key
    const path = `${this.RESOURCE_PATH}/component/${componentId}/regenerate-key`;
    // Use http_client directly as it's a POST to a sub-path with no body
    return this.httpClient.post<ConnectivityDetails>(path, undefined, config);
  }
}

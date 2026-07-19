import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Define interfaces for Tailscale Config data structures
interface TailscaleConfigDetails {
  id: string; // uuid
  apiUrl: string;
  tailnet: string;
  apiKeyConfigured: boolean; // Indicates if API key is set (key itself not returned)
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface SetTailscaleConfigPayload {
  tailnet: string;
  apiKey: string;
  apiUrl?: string;
}

interface CheckTailscaleConfigResponse {
    configured: boolean;
    apiUrl?: string | null;
    tailnet?: string | null;
}

export class TailscaleConfigResource extends BaseResource {
  protected readonly RESOURCE_PATH = "tailscale-config"; // Note hyphen

  async get(config?: AxiosRequestConfig): Promise<TailscaleConfigDetails> {
    // Corresponds to GET /api/tailscale-config
    return this._list<TailscaleConfigDetails>(undefined, config); // Use _list for base path GET
  }

  async set(payload: SetTailscaleConfigPayload, config?: AxiosRequestConfig): Promise<TailscaleConfigDetails> {
    // Corresponds to POST /api/tailscale-config
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<TailscaleConfigDetails>(cleanedPayload, undefined, config); // Use _create for base path POST
  }

  async delete(config?: AxiosRequestConfig): Promise<{ message: string }> {
    // Corresponds to DELETE /api/tailscale-config
    // API Spec indicates 200 OK with message
    const path = this._getPath();
    // Use http_client directly as base _delete expects ID and handles 204 (null)
    const result = await this.httpClient.delete<{ message: string } | null>(path, config);
    if (result === null) {
        throw new APIError(`DELETE ${path} returned null/204, expected 200 with message.`);
    }
    return result;
  }

  async check(config?: AxiosRequestConfig): Promise<CheckTailscaleConfigResponse> {
    // Corresponds to GET /api/tailscale-config/check
    const path = `${this.RESOURCE_PATH}/check`;
    return this.httpClient.get<CheckTailscaleConfigResponse>(path, config);
  }
}

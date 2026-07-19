import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Webhook data structures
interface GenericWebhookPayload {
    source: string;
    event: string;
    timestamp?: string; // ISO Date string
    payload: Record<string, any>; // Arbitrary JSON payload
    metadata?: Record<string, any>;
}

interface WebhookResponse {
    success: boolean;
    message: string;
    id?: string; // ID of the processed webhook event
}

interface HealthCheckResponse {
    success: boolean;
    message: string;
    timestamp: string; // ISO Date string
}

export class WebhooksResource extends BaseResource {
  // Webhook ingress endpoints live under /api/webhooks on the server. Because
  // the SDK base URL already includes the `/api` prefix, we strip it and build
  // the full URL here to avoid a doubled prefix.
  protected readonly RESOURCE_PATH = "api/webhooks"; // Base segment for path construction

  private _getWebhookUrl(subpath?: string): string {
      // Construct the full URL, assuming base URL is like http://host:port/api
      const base = this.httpClient.getBaseUrl().replace('/api', ''); // Get http://host:port
      let fullPath = `${base}/${this.RESOURCE_PATH}`;
      if (subpath) {
          fullPath = `${fullPath}/${subpath}`;
      }
      return fullPath;
  }

  async receiveGeneric(payload: GenericWebhookPayload, config?: AxiosRequestConfig): Promise<WebhookResponse> {
    // Corresponds to POST /api/webhooks
    const url = this._getWebhookUrl();
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    // Use request method directly with full URL
    return this.httpClient.request<WebhookResponse>({ ...config, method: 'POST', url, data: cleanedPayload });
  }

  async receiveGithub(payload?: Record<string, any>, headers?: Record<string, string>, config?: AxiosRequestConfig): Promise<WebhookResponse> {
    // Corresponds to POST /api/webhooks/github
    const url = this._getWebhookUrl('github');
    const requestConfig = { ...config, headers: { ...config?.headers, ...headers } };
    // Use request method directly with full URL
    return this.httpClient.request<WebhookResponse>({ ...requestConfig, method: 'POST', url, data: payload });
  }

  async healthCheck(config?: AxiosRequestConfig): Promise<HealthCheckResponse> {
    // Corresponds to GET /api/webhooks/health
    const url = this._getWebhookUrl('health');
    // Use request method directly with full URL
    return this.httpClient.request<HealthCheckResponse>({ ...config, method: 'GET', url });
  }
}

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Connectivity providers (/api/connectivity-providers) — generic connectivity
// adapters (SSH / WireGuard / self-managed Tailscale). All routes require admin
// privileges on the server.

export class ConnectivityProvidersResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'connectivity-providers';

  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  async get(providerId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(providerId, undefined, config);
  }

  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  async update(providerId: string, data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._update<any>(providerId, data, undefined, config);
  }

  async delete(providerId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(providerId, undefined, config);
  }

  /** Runs a live connection test. POST /api/connectivity-providers/{id}/test */
  async test(providerId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(providerId, 'test', 'POST', undefined, undefined, config);
  }

  /** Marks the provider as the default. POST /api/connectivity-providers/{id}/set-default */
  async setDefault(providerId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(providerId, 'set-default', 'POST', undefined, undefined, config);
  }
}

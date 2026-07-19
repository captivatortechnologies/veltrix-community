import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Apps are the pluggable security tools that extend the platform via the app
// engine (marketplace listing, installation, configuration).
//
// Provisional: the base route (/api/apps) matches the Community Edition server
// surface, but the method surface below (installation / configuration
// sub-actions) follows standard REST conventions and may be refined as the OSS
// API stabilizes.

export class AppsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'apps';

  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  async get(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(appId, undefined, config);
  }

  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  async update(appId: string, data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._update<any>(appId, data, undefined, config);
  }

  async delete(appId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(appId, undefined, config);
  }
}

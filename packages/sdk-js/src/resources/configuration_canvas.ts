import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// The configuration canvas is the visual authoring surface where security
// configuration (sections, fields) is composed before it flows through the
// pipeline.
//
// Provisional: the base route (/api/configuration-canvas) matches the
// Community Edition server surface, but the method surface below follows
// standard REST conventions and may be refined as the OSS API stabilizes.

export class ConfigurationCanvasResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'configuration-canvas';

  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  async get(canvasId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(canvasId, undefined, config);
  }

  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  async update(canvasId: string, data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._update<any>(canvasId, data, undefined, config);
  }

  async delete(canvasId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(canvasId, undefined, config);
  }
}

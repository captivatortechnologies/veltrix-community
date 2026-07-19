import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Versioned history of configuration changes (author, approvals, comments)
// produced by the configuration canvas and pipeline.
//
// Provisional: the base route (/api/configuration-history) matches the
// Community Edition server surface, but the method surface below follows
// standard REST conventions and may be refined as the OSS API stabilizes.

export class ConfigurationHistoryResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'configuration-history';

  async list(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(params, config);
  }

  async get(historyId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(historyId, undefined, config);
  }
}

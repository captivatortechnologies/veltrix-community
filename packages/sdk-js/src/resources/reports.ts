import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Tenant-scoped reporting (audit, activity, resources, security, compliance).
//
// Provisional: the base route (/api/reports) matches the Community Edition
// server surface, but the method surface below follows standard REST
// conventions and may be refined as the OSS API stabilizes.

export class ReportsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'reports';

  async list(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(params, config);
  }

  async get(reportId: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(reportId, params, config);
  }
}

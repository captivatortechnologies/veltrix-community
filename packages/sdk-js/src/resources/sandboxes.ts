import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Developer sandboxes (/api/sandboxes) — power the Veltrix CLI dev mode.
//
// Provisional: sandboxes are gated behind the `platform.sandbox` feature flag
// (off by default; every route returns 404 while disabled). Only the core CRUD
// surface is exposed here; the richer file-sync / run endpoints are
// intentionally left out until the OSS API stabilizes.

export class SandboxesResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'sandboxes';

  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  async get(sandboxId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(sandboxId, undefined, config);
  }

  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  async delete(sandboxId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(sandboxId, undefined, config);
  }
}

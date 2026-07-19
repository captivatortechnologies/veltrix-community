import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Public feature-flags endpoint (/api/feature-flags). Used by clients to
// conditionally enable UI/behaviour. Public — no authentication required.

export class FeatureFlagsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'feature-flags';

  /** Retrieves the deployment's feature flags. GET /api/feature-flags */
  async get(config?: AxiosRequestConfig): Promise<Record<string, any>> {
    return this._list<Record<string, any>>(undefined, config);
  }
}

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Public branding endpoint (/api/brand). Returns the deployment's branding
// (name, tagline, logo URL). Public — no authentication required.

interface Brand {
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
}

export class BrandResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'brand';

  /** Retrieves the deployment branding. GET /api/brand */
  async get(config?: AxiosRequestConfig): Promise<Brand> {
    return this._list<Brand>(undefined, config);
  }
}

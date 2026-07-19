import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Deployment environments used by the pipeline engine (e.g. dev / staging /
// production).
//
// Provisional: the base route (/api/environments) matches the Community
// Edition server surface, but the method surface below follows standard REST
// conventions and may be refined as the OSS API stabilizes.

interface Environment {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface CreateEnvironmentPayload {
  name: string;
  description?: string;
}

interface UpdateEnvironmentPayload {
  name?: string;
  description?: string;
}

export class EnvironmentsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'environments';

  async list(config?: AxiosRequestConfig): Promise<Environment[]> {
    return this._list<Environment[]>(undefined, config);
  }

  async get(environmentId: string, config?: AxiosRequestConfig): Promise<Environment> {
    return this._get<Environment>(environmentId, undefined, config);
  }

  async create(payload: CreateEnvironmentPayload, config?: AxiosRequestConfig): Promise<Environment> {
    const cleanedPayload = Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<Environment>(cleanedPayload, undefined, config);
  }

  async update(environmentId: string, payload: UpdateEnvironmentPayload, config?: AxiosRequestConfig): Promise<Environment> {
    const cleanedPayload = Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Environment>(environmentId, cleanedPayload, undefined, config);
  }

  async delete(environmentId: string, config?: AxiosRequestConfig): Promise<Environment | null> {
    return this._delete<Environment>(environmentId, undefined, config);
  }
}

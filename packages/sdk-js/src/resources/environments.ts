import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Deployment environments used by the pipeline engine (e.g. dev / staging /
// production). Environments are Tag-backed and carry an ownership + a
// per-environment deployment policy. There is no single-environment GET route;
// read the full set via list().
//
// Mounted at /api/environments on the Community Edition server.

interface Environment {
  id: string;
  name: string;
  ownerId?: string | null;
  [key: string]: any;
}

interface CreateEnvironmentPayload {
  name: string;
  ownerId?: string | null;
}

interface UpdateEnvironmentPayload {
  name?: string;
  ownerId?: string | null;
}

interface EnvironmentPolicyPayload {
  requireApproval?: boolean;
  minApprovers?: number;
  requiredApproverRoles?: string[];
  deploymentStrategy?: 'DIRECT' | 'CANARY' | 'BLUE_GREEN' | 'ROLLING';
  canarySteps?: number[];
  healthCheckTimeout?: number;
  autoRollbackOnError?: boolean;
  errorRateThreshold?: number;
  requirePreviousEnv?: boolean;
  previousEnvTagId?: string | null;
  [key: string]: any;
}

export class EnvironmentsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'environments';

  /** List environments (with ownership, policy and usage counts). GET /api/environments */
  async list(config?: AxiosRequestConfig): Promise<Environment[]> {
    return this._list<Environment[]>(undefined, config);
  }

  /** Create an environment. POST /api/environments — body: { name, ownerId? }. */
  async create(payload: CreateEnvironmentPayload, config?: AxiosRequestConfig): Promise<Environment> {
    return this._create<Environment>(payload, undefined, config);
  }

  /** Update an environment (name / owner). PUT /api/environments/{environmentId} */
  async update(environmentId: string, payload: UpdateEnvironmentPayload, config?: AxiosRequestConfig): Promise<Environment> {
    return this._update<Environment>(environmentId, payload, undefined, config);
  }

  /** Delete an environment. DELETE /api/environments/{environmentId} */
  async delete(environmentId: string, config?: AxiosRequestConfig): Promise<Environment | null> {
    return this._delete<Environment>(environmentId, undefined, config);
  }

  /** Get an environment's deployment policy. GET /api/environments/{environmentId}/policy */
  async getPolicy(environmentId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${environmentId}/policy`, config);
  }

  /** Create/update an environment's deployment policy. PUT /api/environments/{environmentId}/policy */
  async updatePolicy(environmentId: string, policy: EnvironmentPolicyPayload, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.put<any>(`${this.RESOURCE_PATH}/${environmentId}/policy`, policy, config);
  }
}

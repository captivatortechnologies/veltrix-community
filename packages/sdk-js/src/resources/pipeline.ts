import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// The pipeline engine drives every security configuration change through
// author -> validate -> approve -> deploy -> monitor -> drift-detect.
// Deployments are the primary entities exposed here.
//
// Provisional: the base route (/api/pipeline) matches the Community Edition
// server surface, but the method surface below (and any strategy/approval
// sub-actions) follows standard REST conventions and may be refined as the
// OSS API stabilizes.

export class PipelineResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'pipeline';

  async listDeployments(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any[]> {
    const path = `${this.RESOURCE_PATH}/deployments`;
    return this.httpClient.get<any[]>(path, { ...config, params });
  }

  async getDeployment(deploymentId: string, config?: AxiosRequestConfig): Promise<any> {
    const path = `${this.RESOURCE_PATH}/deployments/${deploymentId}`;
    return this.httpClient.get<any>(path, config);
  }

  async createDeployment(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    const path = `${this.RESOURCE_PATH}/deployments`;
    return this.httpClient.post<any>(path, data, config);
  }
}

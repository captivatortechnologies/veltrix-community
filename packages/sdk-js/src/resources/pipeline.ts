import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// The pipeline engine drives every approved configuration canvas through
// deploy -> monitor -> drift-detect. Deployments are created by deploying a
// canvas (there is no standalone "create deployment" endpoint); every other
// operation acts on an existing canvas or deployment.
//
// Mounted at /api/pipeline on the Community Edition server.

export class PipelineResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'pipeline';

  /** Run the app validator against a canvas. POST /api/pipeline/canvas/{canvasId}/validate */
  async validateCanvas(canvasId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/canvas/${canvasId}/validate`, undefined, config);
  }

  /**
   * Queue a deployment of an approved canvas to a target environment.
   * POST /api/pipeline/canvas/{canvasId}/deploy — body: { environmentId, strategy? }.
   */
  async deployCanvas(
    canvasId: string,
    data: { environmentId: string; strategy?: string; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/canvas/${canvasId}/deploy`, data, config);
  }

  /** Deployment history for a canvas. GET /api/pipeline/canvas/{canvasId}/deployments */
  async listCanvasDeployments(canvasId: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/canvas/${canvasId}/deployments`, { ...config, params });
  }

  /** Detailed status of a deployment (including logs). GET /api/pipeline/deployments/{deploymentId} */
  async getDeployment(deploymentId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/deployments/${deploymentId}`, config);
  }

  /**
   * Roll a deployment back to the previous version.
   * POST /api/pipeline/deployments/{deploymentId}/rollback — body: { reason }.
   */
  async rollbackDeployment(
    deploymentId: string,
    data: { reason: string; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/deployments/${deploymentId}/rollback`, data, config);
  }

  /** Pause an in-progress (canary/rolling) deployment. POST /api/pipeline/deployments/{deploymentId}/pause */
  async pauseDeployment(deploymentId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/deployments/${deploymentId}/pause`, undefined, config);
  }

  /** Resume a paused deployment. POST /api/pipeline/deployments/{deploymentId}/resume */
  async resumeDeployment(deploymentId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/deployments/${deploymentId}/resume`, undefined, config);
  }

  /**
   * Promote a successful deployment to the next environment.
   * POST /api/pipeline/deployments/{deploymentId}/promote — body: { targetEnvironmentId }.
   */
  async promoteDeployment(
    deploymentId: string,
    data: { targetEnvironmentId: string; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/deployments/${deploymentId}/promote`, data, config);
  }

  /** Pipeline dashboard metrics for the customer. GET /api/pipeline/summary */
  async getSummary(config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/summary`, config);
  }

  /** Matrix of canvases and their deployment status per environment. GET /api/pipeline/environment-matrix */
  async getEnvironmentMatrix(config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/environment-matrix`, config);
  }

  /** Drift-detection records for the customer. GET /api/pipeline/drift */
  async listDrift(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/drift`, { ...config, params });
  }

  /**
   * Acknowledge and resolve a drift record.
   * POST /api/pipeline/drift/{driftId}/resolve — body: { action }.
   */
  async resolveDrift(
    driftId: string,
    data: { action: string; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/drift/${driftId}/resolve`, data, config);
  }
}

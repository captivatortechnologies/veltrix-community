import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// The configuration canvas is the visual authoring surface where security
// configuration (sections, fields) is composed, versioned, reviewed and
// approved before it flows through the pipeline.
//
// Mounted at /api/configuration-canvas on the Community Edition server.

export class ConfigurationCanvasResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'configuration-canvas';

  /** List canvases. GET /api/configuration-canvas — query: toolType, entityType, status, page, limit, sortBy, sortOrder. */
  async list(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._list<any>(params, config);
  }

  /** Get a single canvas. GET /api/configuration-canvas/{canvasId} */
  async get(canvasId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(canvasId, undefined, config);
  }

  /** Create a canvas. POST /api/configuration-canvas — body: { name, toolType, entityType, ... }. */
  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  /** Update a canvas. PUT /api/configuration-canvas/{canvasId} */
  async update(canvasId: string, data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._update<any>(canvasId, data, undefined, config);
  }

  /** Delete a canvas (draft or archived only). DELETE /api/configuration-canvas/{canvasId} */
  async delete(canvasId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(canvasId, undefined, config);
  }

  /** Update canvas status (approval workflow). PATCH /api/configuration-canvas/{canvasId}/status — body: { status, comment? }. */
  async updateStatus(canvasId: string, data: { status: string; comment?: string }, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(canvasId, 'status', 'PATCH', data, undefined, config);
  }

  /** Version history of a canvas. GET /api/configuration-canvas/{canvasId}/history */
  async getHistory(canvasId: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/${canvasId}/history`, { ...config, params });
  }

  /** Duplicate a canvas. POST /api/configuration-canvas/{canvasId}/duplicate — body: { name }. */
  async duplicate(canvasId: string, data: { name: string }, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(canvasId, 'duplicate', 'POST', data, undefined, config);
  }

  /** Export a canvas as JSON. GET /api/configuration-canvas/{canvasId}/export */
  async export(canvasId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${canvasId}/export`, config);
  }

  /** Get a specific version entry. GET /api/configuration-canvas/{canvasId}/versions/{historyId} */
  async getVersion(canvasId: string, historyId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${canvasId}/versions/${historyId}`, config);
  }

  /** Restore a canvas to a previous version (draft only). POST /api/configuration-canvas/{canvasId}/versions/{historyId}/restore */
  async restoreVersion(canvasId: string, historyId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${canvasId}/versions/${historyId}/restore`, undefined, config);
  }

  /** Compare two versions. GET /api/configuration-canvas/{canvasId}/compare — query: historyId1, historyId2. */
  async compareVersions(
    canvasId: string,
    params: { historyId1: string; historyId2: string },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${canvasId}/compare`, { ...config, params });
  }

  /** Label/comment a version. PATCH /api/configuration-canvas/{canvasId}/versions/{historyId}/label — body: { label }. */
  async labelVersion(canvasId: string, historyId: string, data: { label: string }, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.patch<any>(`${this.RESOURCE_PATH}/${canvasId}/versions/${historyId}/label`, data, config);
  }

  /** Submit a canvas for approval. POST /api/configuration-canvas/{canvasId}/submit-for-approval — body: { approverIds, environmentTagIds?, comment? }. */
  async submitForApproval(
    canvasId: string,
    data: { approverIds: string[]; environmentTagIds?: string[]; comment?: string },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this._action<any>(canvasId, 'submit-for-approval', 'POST', data, undefined, config);
  }

  /** Approval status for a canvas. GET /api/configuration-canvas/{canvasId}/approvals */
  async getApprovals(canvasId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${canvasId}/approvals`, config);
  }

  /** Approve a canvas (as an assigned approver). POST /api/configuration-canvas/{canvasId}/approve — body: { comment? }. */
  async approve(canvasId: string, data?: { comment?: string }, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(canvasId, 'approve', 'POST', data, undefined, config);
  }

  /** Reject a canvas (as an assigned approver). POST /api/configuration-canvas/{canvasId}/reject — body: { reason }. */
  async reject(canvasId: string, data: { reason: string }, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(canvasId, 'reject', 'POST', data, undefined, config);
  }

  /** Threaded review comments for a canvas. GET /api/configuration-canvas/{canvasId}/comments — query: historyId?. */
  async getComments(canvasId: string, params?: { historyId?: string }, config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/${canvasId}/comments`, { ...config, params });
  }

  /** Add a review comment. POST /api/configuration-canvas/{canvasId}/comments — body: { body, historyId?, parentId? }. */
  async addComment(
    canvasId: string,
    data: { body: string; historyId?: string; parentId?: string },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this._action<any>(canvasId, 'comments', 'POST', data, undefined, config);
  }

  /** Update a review comment. PATCH /api/configuration-canvas/{canvasId}/comments/{commentId} — body: { body?, resolved? }. */
  async updateComment(
    canvasId: string,
    commentId: string,
    data: { body?: string; resolved?: boolean },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.patch<any>(`${this.RESOURCE_PATH}/${canvasId}/comments/${commentId}`, data, config);
  }

  /** Delete a review comment. DELETE /api/configuration-canvas/{canvasId}/comments/{commentId} */
  async deleteComment(canvasId: string, commentId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this.httpClient.delete<any>(`${this.RESOURCE_PATH}/${canvasId}/comments/${commentId}`, config);
  }
}

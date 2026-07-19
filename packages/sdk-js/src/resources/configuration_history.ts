import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Versioned audit history of configuration changes (author, approvals,
// reverts) across every entity type. Powers the client's history/audit views
// and the approval workflow.
//
// Mounted at /api/configuration-history on the Community Edition server.

export class ConfigurationHistoryResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'configuration-history';

  /**
   * List history entries. GET /api/configuration-history — query filters:
   * action, entityType, entityId, userId, deployState, startDate, endDate,
   * searchTerm, page, limit (comma-separated for the list-valued filters).
   */
  async list(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._list<any>(params, config);
  }

  /** Get a single history entry. GET /api/configuration-history/{historyId} */
  async get(historyId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(historyId, undefined, config);
  }

  /** Pending approvals. GET /api/configuration-history/pending-approvals — query: entityType?, entityId?. */
  async listPendingApprovals(params?: { entityType?: string; entityId?: string }, config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/pending-approvals`, { ...config, params });
  }

  /** Distinct entity types (for filter dropdowns). GET /api/configuration-history/entity-types */
  async getEntityTypes(config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/entity-types`, config);
  }

  /** Distinct users (for filter dropdowns). GET /api/configuration-history/users */
  async getUsers(config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/users`, config);
  }

  /** Create a history entry. POST /api/configuration-history — body requires action, entityType, entityId. */
  async create(data: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  /** Approve a pending change. POST /api/configuration-history/approve/{id} */
  async approve(id: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/approve/${id}`, undefined, config);
  }

  /** Reject a pending change. POST /api/configuration-history/reject/{id} — body: { reason? }. */
  async reject(id: string, data?: { reason?: string }, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/reject/${id}`, data, config);
  }

  /** Revert to a previous version. POST /api/configuration-history/revert — body: { versionId }. */
  async revert(versionId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/revert`, { versionId }, config);
  }
}

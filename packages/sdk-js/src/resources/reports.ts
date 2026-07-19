import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Tenant-scoped reporting. Each endpoint aggregates real data for the caller's
// tenant into a fixed, named report — there is no list/get-by-id surface.
//
// Mounted at /api/reports on the Community Edition server.

export class ReportsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'reports';

  /** Unified activity feed. GET /api/reports/audit-logs */
  async getAuditLogs(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/audit-logs`, { ...config, params });
  }

  /** User-activity report (stats, sessions, actions). GET /api/reports/user-activity */
  async getUserActivity(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/user-activity`, { ...config, params });
  }

  /** Resource-usage report (real inventory). GET /api/reports/resource-usage */
  async getResourceUsage(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/resource-usage`, { ...config, params });
  }

  /** Security-overview report (derived posture). GET /api/reports/security-overview */
  async getSecurityOverview(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/security-overview`, { ...config, params });
  }

  /** Compliance report (frameworks + controls). GET /api/reports/compliance */
  async getCompliance(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/compliance`, { ...config, params });
  }
}

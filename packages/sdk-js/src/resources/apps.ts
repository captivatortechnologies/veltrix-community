import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Apps are the pluggable security tools that extend the platform via the app
// engine: browse the marketplace, install/uninstall, enable/disable per tenant,
// upgrade, manage settings, and run per-app connection tests / operations.
// Apps are identified by their manifest slug (appId), not a UUID.
//
// Mounted at /api/apps on the Community Edition server. (The binary
// multipart upload route, POST /api/apps/upload, is intentionally not wrapped.)

export class AppsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'apps';

  /** List all apps with installation status for the customer. GET /api/apps */
  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  /** List enabled apps with client config (for the app loader). GET /api/apps/enabled */
  async listEnabled(config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/enabled`, config);
  }

  /** Browse the marketplace catalog. GET /api/apps/marketplace — query: search?, category?. */
  async getMarketplace(params?: { search?: string; category?: string }, config?: AxiosRequestConfig): Promise<any[]> {
    return this.httpClient.get<any[]>(`${this.RESOURCE_PATH}/marketplace`, { ...config, params });
  }

  /** Get app detail. GET /api/apps/{appId} */
  async get(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(appId, undefined, config);
  }

  /** Enable an app for the customer. POST /api/apps/{appId}/enable */
  async enable(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'enable', 'POST', undefined, undefined, config);
  }

  /** Disable an app for the customer (data preserved). POST /api/apps/{appId}/disable */
  async disable(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'disable', 'POST', undefined, undefined, config);
  }

  /** This tenant's version status + upgrade availability. GET /api/apps/{appId}/version */
  async getVersion(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'version', 'GET', undefined, undefined, config);
  }

  /** Upgrade the app for this tenant. POST /api/apps/{appId}/upgrade */
  async upgrade(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'upgrade', 'POST', undefined, undefined, config);
  }

  /** Install an app from the marketplace/built-in catalog. POST /api/apps/{appId}/install */
  async install(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'install', 'POST', undefined, undefined, config);
  }

  /** Uninstall a custom/marketplace app. DELETE /api/apps/{appId} */
  async uninstall(appId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(appId, undefined, config);
  }

  /** Install an app from a remote package URL. POST /api/apps/install-from-url — body: { url }. */
  async installFromUrl(url: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/install-from-url`, { url }, config);
  }

  /** Get customer-specific app settings (merged with manifest defaults). GET /api/apps/{appId}/settings */
  async getSettings(appId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._action<any>(appId, 'settings', 'GET', undefined, undefined, config);
  }

  /** Update customer-specific app settings. PUT /api/apps/{appId}/settings — body: { settings }. */
  async updateSettings(appId: string, settings: Record<string, any>, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.put<any>(`${this.RESOURCE_PATH}/${appId}/settings`, { settings }, config);
  }

  /** Get a config type's canvas template (parsed YAML). GET /api/apps/{appId}/config-types/{configTypeId}/canvas */
  async getConfigTemplate(appId: string, configTypeId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${appId}/config-types/${configTypeId}/canvas`, config);
  }

  /** Get a config type's defaults (parsed YAML). GET /api/apps/{appId}/config-types/{configTypeId}/defaults */
  async getConfigDefaults(appId: string, configTypeId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${appId}/config-types/${configTypeId}/defaults`, config);
  }

  /** Test a connection's endpoint + credential in-process. POST /api/apps/{appId}/connections/{credentialId}/test */
  async testConnection(appId: string, credentialId: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${appId}/connections/${credentialId}/test`, undefined, config);
  }

  /**
   * Run a declared app operation (restart, export, retry, ...).
   * POST /api/apps/{appId}/operations/{operationId} — body: { credentialId?, params? }.
   */
  async runOperation(
    appId: string,
    operationId: string,
    data?: { credentialId?: string; params?: Record<string, any> },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${appId}/operations/${operationId}`, data, config);
  }
}

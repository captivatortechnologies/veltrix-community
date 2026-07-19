import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Developer sandboxes power the Veltrix CLI dev mode: an isolated, per-tenant
// workspace that syncs app sources, edits individual files, scaffolds config
// types, and runs pipeline handlers in an isolated runner.
//
// Mounted at /api/sandboxes on the Community Edition server. The whole module
// is gated behind the `platform.sandbox` feature flag (off by default): every
// route returns 404 while it is disabled. The two binary-transport routes
// (GET /:id/client.mjs, PUT /:id/sync/files — raw JS / tar.gz) are intentionally
// not wrapped here.

export class SandboxesResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'sandboxes';

  /** List sandboxes for the tenant. GET /api/sandboxes */
  async list(config?: AxiosRequestConfig): Promise<any[]> {
    return this._list<any[]>(undefined, config);
  }

  /** Get a sandbox (with live manifest summary once synced). GET /api/sandboxes/{sandboxId} */
  async get(sandboxId: string, config?: AxiosRequestConfig): Promise<any> {
    return this._get<any>(sandboxId, undefined, config);
  }

  /** Create a sandbox. POST /api/sandboxes — body: { name, appId }. */
  async create(data: { name: string; appId: string; [key: string]: any }, config?: AxiosRequestConfig): Promise<any> {
    return this._create<any>(data, undefined, config);
  }

  /** Delete a sandbox (record + synced files). DELETE /api/sandboxes/{sandboxId} */
  async delete(sandboxId: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this._delete<any>(sandboxId, undefined, config);
  }

  /** List synced files (paginated). GET /api/sandboxes/{sandboxId}/files — query: limit?, offset?. */
  async listFiles(sandboxId: string, params?: { limit?: number; offset?: number }, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${sandboxId}/files`, { ...config, params });
  }

  /** Read one synced file's content. GET /api/sandboxes/{sandboxId}/file — query: path. */
  async getFile(sandboxId: string, filePath: string, config?: AxiosRequestConfig): Promise<any> {
    return this.httpClient.get<any>(`${this.RESOURCE_PATH}/${sandboxId}/file`, { ...config, params: { path: filePath } });
  }

  /**
   * Create/overwrite one file (optimistic concurrency via expectedSha256).
   * PUT /api/sandboxes/{sandboxId}/file — body: { path, content, encoding, expectedSha256? }.
   */
  async writeFile(
    sandboxId: string,
    data: { path: string; content: string; encoding: 'utf8' | 'base64'; expectedSha256?: string; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.put<any>(`${this.RESOURCE_PATH}/${sandboxId}/file`, data, config);
  }

  /** Delete one synced file. DELETE /api/sandboxes/{sandboxId}/file — query: path. */
  async deleteFile(sandboxId: string, filePath: string, config?: AxiosRequestConfig): Promise<any | null> {
    return this.httpClient.delete<any>(`${this.RESOURCE_PATH}/${sandboxId}/file`, { ...config, params: { path: filePath } });
  }

  /** Scaffold a new configuration type into the synced app. POST /api/sandboxes/{sandboxId}/config-types — body: { id, name?, componentTypes? }. */
  async addConfigType(
    sandboxId: string,
    data: { id: string; name?: string; componentTypes?: string[]; [key: string]: any },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${sandboxId}/config-types`, data, config);
  }

  /**
   * Compute a sync manifest diff (step 1 of a CLI sync). The client sends its
   * local file manifest and gets back which files to upload/delete.
   * POST /api/sandboxes/{sandboxId}/sync/manifest — body: [{ path, sha256, size }].
   */
  async syncManifest(
    sandboxId: string,
    manifest: Array<{ path: string; sha256: string; size: number }>,
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${sandboxId}/sync/manifest`, manifest, config);
  }

  /**
   * Run a synced pipeline handler in the isolated runner.
   * POST /api/sandboxes/{sandboxId}/run — body: { configTypeId, handler, canvas?, componentId? }.
   */
  async run(
    sandboxId: string,
    data: { configTypeId: string; handler: string; canvas?: Record<string, any>; componentId?: string },
    config?: AxiosRequestConfig,
  ): Promise<any> {
    return this.httpClient.post<any>(`${this.RESOURCE_PATH}/${sandboxId}/run`, data, config);
  }
}

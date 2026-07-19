import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Endpoints scoped to the authenticated user themselves (/api/me).

interface PermissionSnapshot {
  permissions: Array<{ resource: string; action: string; appId?: string | null }>;
  wildcards: {
    allAll?: boolean;
    resources?: string[];
  };
}

export class MeResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'me';

  /**
   * Returns the current user's resolved permission snapshot.
   * Corresponds to GET /api/me/permissions.
   */
  async getPermissions(config?: AxiosRequestConfig): Promise<PermissionSnapshot> {
    const path = `${this.RESOURCE_PATH}/permissions`;
    return this.httpClient.get<PermissionSnapshot>(path, config);
  }
}

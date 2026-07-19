import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Role data structures
interface Permission {
    id?: string; // uuid, might not be present on create payload
    resource: string;
    action: string;
    roleId?: string; // uuid, might not be present on create payload
}

interface Role {
  id: string; // uuid
  name: string;
  description?: string | null;
  customerId: string; // uuid
  isSystemRole: boolean;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
  permissions?: Permission[];
}

interface CreateRolePayload {
  name: string;
  description?: string | null;
  permissions?: Array<{ resource: string; action: string }>; // Simplified for creation
}

interface UpdateRolePayload {
  name?: string;
  description?: string | null;
  permissions?: Array<{ resource: string; action: string }>; // Simplified for update
}

export class RolesResource extends BaseResource {
  protected readonly RESOURCE_PATH = "roles";

  async list(config?: AxiosRequestConfig): Promise<Role[]> {
    // Corresponds to GET /api/roles
    return this._list<Role[]>(undefined, config);
  }

  async create(payload: CreateRolePayload, config?: AxiosRequestConfig): Promise<Role> {
    // Corresponds to POST /api/roles
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<Role>(cleanedPayload, undefined, config);
  }

  async get(roleId: string, config?: AxiosRequestConfig): Promise<Role> {
    // Corresponds to GET /api/roles/{id}
    return this._get<Role>(roleId, undefined, config);
  }

  async update(roleId: string, payload: UpdateRolePayload, config?: AxiosRequestConfig): Promise<Role> {
    // Corresponds to PUT /api/roles/{id}
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Role>(roleId, cleanedPayload, undefined, config);
  }

  async delete(roleId: string, config?: AxiosRequestConfig): Promise<null> {
    // Corresponds to DELETE /api/roles/{id}
    // API Spec indicates 204 No Content
    return this._delete<null>(roleId, undefined, config);
  }

  // --- Helper endpoints for permissions ---

  async listAvailableResources(config?: AxiosRequestConfig): Promise<string[]> {
    // Corresponds to GET /api/resources
    const path = "resources"; // Path is different from base resource path
    return this.httpClient.get<string[]>(path, config);
  }

  async listResourceActions(resourceName: string, config?: AxiosRequestConfig): Promise<string[]> {
    // Corresponds to GET /api/resources/{resource}/actions
    const path = `resources/${resourceName}/actions`; // Path is different
    return this.httpClient.get<string[]>(path, config);
  }
}

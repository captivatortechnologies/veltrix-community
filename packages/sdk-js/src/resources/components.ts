import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Component data structures
interface Component {
  id: string; // uuid
  name: string;
  description?: string | null;
  toolId: string; // uuid
  customerId: string; // uuid
  configuration?: Record<string, any> | null; // Assuming JSON object
  status?: string | null;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface CreateComponentPayload {
  name: string;
  toolId: string; // uuid
  description?: string | null;
  configuration?: Record<string, any> | null;
  status?: string | null;
}

interface UpdateComponentPayload {
  name?: string;
  description?: string | null;
  configuration?: Record<string, any> | null;
  status?: string | null;
}

export class ComponentsResource extends BaseResource {
  protected readonly RESOURCE_PATH = "components";

  async list(config?: AxiosRequestConfig): Promise<Component[]> {
    // Corresponds to GET /api/components
    return this._list<Component[]>(undefined, config);
  }

  async create(payload: CreateComponentPayload, config?: AxiosRequestConfig): Promise<Component> {
    // Corresponds to POST /api/components
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<Component>(cleanedPayload, undefined, config);
  }

  async listForTool(toolId: string, config?: AxiosRequestConfig): Promise<Component[]> {
    // Corresponds to GET /api/tools/{toolId}/components
    const path = `tools/${toolId}/components`;
    return this.httpClient.get<Component[]>(path, config);
  }

  async get(componentId: string, config?: AxiosRequestConfig): Promise<Component> {
    // Corresponds to GET /api/components/{id}
    return this._get<Component>(componentId, undefined, config);
  }

  async update(componentId: string, payload: UpdateComponentPayload, config?: AxiosRequestConfig): Promise<Component> {
    // Corresponds to PUT /api/components/{id}
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Component>(componentId, cleanedPayload, undefined, config);
  }

  async delete(componentId: string, config?: AxiosRequestConfig): Promise<null> {
    // Corresponds to DELETE /api/components/{id}
    // API Spec indicates 204 No Content for this delete
    return this._delete<null>(componentId, undefined, config);
  }
}

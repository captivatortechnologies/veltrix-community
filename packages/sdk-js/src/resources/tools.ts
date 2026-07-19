import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors'; // Import APIError

// Define interfaces for Tool data structures based on OpenAPI spec
// (These might be more detailed in a real implementation)
interface Tool {
  id: string;
  name: string;
  description: string;
  vendor: string;
  logoUrl?: string | null;
  category: string;
  isActive: boolean;
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
  integrations?: Array<{ id: string; status: string; lastSync?: string | null }>; // Example
}

interface CreateToolPayload {
  name: string;
  description: string;
  vendor: string;
  category: string;
  logoUrl?: string | null;
  customerId?: string | null; // Optional, for admin use
}

interface UpdateToolPayload {
  name?: string;
  description?: string;
  vendor?: string;
  category?: string;
  logoUrl?: string | null;
  isActive?: boolean;
  customerId?: string | null; // Optional, for admin use
}

interface ListToolsParams {
    vendor?: string;
    category?: string;
    search?: string;
    customerId?: string;
}


export class ToolsResource extends BaseResource {
  protected readonly RESOURCE_PATH = "tools";

  async list(params?: ListToolsParams, config?: AxiosRequestConfig): Promise<Tool[]> {
    // Clean params object to remove undefined/null values
    const cleanedParams = Object.entries(params || {})
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return this._list<Tool[]>(cleanedParams, config);
  }

  async create(payload: CreateToolPayload, config?: AxiosRequestConfig): Promise<Tool> {
     // Clean payload object to remove undefined/null values
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return this._create<Tool>(cleanedPayload, undefined, config);
  }

  async get(toolId: string, config?: AxiosRequestConfig): Promise<Tool> {
    return this._get<Tool>(toolId, undefined, config);
  }

  async update(toolId: string, payload: UpdateToolPayload, config?: AxiosRequestConfig): Promise<Tool> {
     // Clean payload object to remove undefined/null values
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    return this._update<Tool>(toolId, cleanedPayload, undefined, config);
  }

  async delete(toolId: string, config?: AxiosRequestConfig): Promise<{ message: string }> {
    // API Spec indicates 200 OK with message for delete, base _delete handles 204 null return.
    // We expect the API to conform to the spec and return 200, so we cast the type.
    const result = await this._delete<{ message: string } | null>(toolId, undefined, config);
    if (result === null) {
        throw new APIError(`DELETE ${this._getPath(toolId)} returned null/204, expected 200 with message.`);
    }
    return result;
  }

  async getVendors(params?: { customerId?: string }, config?: AxiosRequestConfig): Promise<string[]> {
    const path = `${this.RESOURCE_PATH}/vendors`;
    const cleanedParams = Object.entries(params || {})
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.get<string[]>(path, { ...config, params: cleanedParams });
  }

  async getCategories(params?: { customerId?: string }, config?: AxiosRequestConfig): Promise<string[]> {
    const path = `${this.RESOURCE_PATH}/categories`;
     const cleanedParams = Object.entries(params || {})
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.get<string[]>(path, { ...config, params: cleanedParams });
  }
}

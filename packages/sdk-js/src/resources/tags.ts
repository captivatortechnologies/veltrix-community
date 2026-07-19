import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Tag data structures
interface Tag {
  id: string; // uuid
  name: string;
  color?: string | null;
  description?: string | null;
  customerId: string; // uuid
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface CreateTagPayload {
  name: string;
  color?: string | null;
  description?: string | null;
}

interface UpdateTagPayload {
  name?: string;
  color?: string | null;
  description?: string | null;
}

export class TagsResource extends BaseResource {
  protected readonly RESOURCE_PATH = "tags";

  // --- Methods scoped to authenticated user's organization ---

  async list(config?: AxiosRequestConfig): Promise<Tag[]> {
    return this._list<Tag[]>(undefined, config);
  }

  async create(payload: CreateTagPayload, config?: AxiosRequestConfig): Promise<Tag> {
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<Tag>(cleanedPayload, undefined, config);
  }

  async update(tagId: string, payload: UpdateTagPayload, config?: AxiosRequestConfig): Promise<Tag> {
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Tag>(tagId, cleanedPayload, undefined, config);
  }

  async delete(tagId: string, config?: AxiosRequestConfig): Promise<null> {
    // API Spec indicates 204 No Content for this delete
    return this._delete<null>(tagId, undefined, config);
  }

  // --- Method for product tags ---

  async listForProduct(productId: string, config?: AxiosRequestConfig): Promise<Tag[]> {
     // Path deviates significantly from the base resource path
     const path = `products/${productId}/tags`;
     return this.httpClient.get<Tag[]>(path, config);
  }
}

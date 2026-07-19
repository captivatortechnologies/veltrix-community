import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for API Key data structures
interface ApiKey {
  id: string;
  name: string;
  key?: string; // Key is only returned on create/regenerate
  type: 'api' | 'admin' | 'webhook';
  createdAt: string; // ISO Date string
  lastUsed?: string | null; // ISO Date string
  expiresAt?: string | null; // ISO Date string
  revoked: boolean;
  scopes?: string[]; // Added based on spec
}

interface CreateApiKeyPayload {
  name: string; // 3-64 chars
  type: 'api' | 'admin' | 'webhook';
  expiresAt?: string | null; // ISO Date string
  scopes?: string[];
}

interface UpdateApiKeyPayload {
  name?: string; // 3-64 chars
  expiresAt?: string | null; // ISO Date string or null to remove expiration
  revoked?: boolean;
  scopes?: string[];
}

interface RegenerateApiKeyPayload {
    retainName?: boolean;
    expiresAt?: string | null; // ISO Date string
}

export class ApiKeysResource extends BaseResource {
  protected readonly RESOURCE_PATH = "api-keys"; // Note hyphen

  async list(config?: AxiosRequestConfig): Promise<Omit<ApiKey, 'key'>[]> {
    // GET /api/api-keys - Key is typically omitted in list view
    return this._list<Omit<ApiKey, 'key'>[]>(undefined, config);
  }

  async create(payload: CreateApiKeyPayload, config?: AxiosRequestConfig): Promise<ApiKey> {
    // POST /api/api-keys - Returns the full key on creation
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<ApiKey>(cleanedPayload, undefined, config);
  }

  async get(keyId: string, config?: AxiosRequestConfig): Promise<Omit<ApiKey, 'key'>> {
    // GET /api/api-keys/{id} - Key is typically omitted in get view
    return this._get<Omit<ApiKey, 'key'>>(keyId, undefined, config);
  }

  async update(keyId: string, payload: UpdateApiKeyPayload, config?: AxiosRequestConfig): Promise<Omit<ApiKey, 'key'>> {
    // PUT /api/api-keys/{id}
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Omit<ApiKey, 'key'>>(keyId, cleanedPayload, undefined, config);
  }

  async delete(keyId: string, config?: AxiosRequestConfig): Promise<null> {
    // DELETE /api/api-keys/{id} - Spec indicates 204 No Content
    return this._delete<null>(keyId, undefined, config);
  }

  async regenerate(keyId: string, payload?: RegenerateApiKeyPayload, config?: AxiosRequestConfig): Promise<ApiKey> {
    // POST /api/api-keys/{id}/regenerate - Returns the full new key
    const action = "regenerate";
    const cleanedPayload = Object.entries(payload || {})
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._action<ApiKey>(keyId, action, 'POST', cleanedPayload, undefined, config);
  }

  async revoke(keyId: string, config?: AxiosRequestConfig): Promise<Omit<ApiKey, 'key'>> {
    // POST /api/api-keys/{id}/revoke
    const action = "revoke";
    return this._action<Omit<ApiKey, 'key'>>(keyId, action, 'POST', undefined, undefined, config);
  }
}

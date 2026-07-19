import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Define interfaces for Credential data structures
interface CredentialTag {
  id: string; // uuid
  name: string;
}

interface Credential {
  id: string; // uuid
  name: string;
  username: string;
  password?: string; // Often masked or not returned on GET
  apiToken?: string | null;
  certificate?: string | null;
  type?: string | null;
  toolId: string; // uuid
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
  tags?: CredentialTag[];
}

interface CreateCredentialPayload {
  name: string;
  username: string;
  password?: string; // Password might be required depending on credential type
  toolId: string; // uuid
  tagIds: string[]; // Array of tag UUIDs
  apiToken?: string | null;
  certificate?: string | null;
  type?: string | null;
  customerId?: string | null; // Optional, for admin use
}

interface UpdateCredentialPayload {
  name?: string;
  username?: string;
  password?: string; // Usually not updatable directly, might require specific action
  apiToken?: string | null;
  certificate?: string | null;
  type?: string | null;
  tagIds?: string[]; // Array of tag UUIDs
}


export class CredentialsResource extends BaseResource {
  protected readonly RESOURCE_PATH = "credentials";

  async listForTool(toolId: string, config?: AxiosRequestConfig): Promise<Credential[]> {
    // Corresponds to GET /api/tools/{toolId}/credentials
    const path = `tools/${toolId}/credentials`;
    return this.httpClient.get<Credential[]>(path, config);
  }

  async get(credentialId: string, config?: AxiosRequestConfig): Promise<Credential> {
    // Corresponds to GET /api/credentials/{id}
    return this._get<Credential>(credentialId, undefined, config);
  }

  async create(payload: CreateCredentialPayload, config?: AxiosRequestConfig): Promise<Credential> {
    // Corresponds to POST /api/credentials
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended, filter only undefined
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<Credential>(cleanedPayload, undefined, config);
  }

  async update(credentialId: string, payload: UpdateCredentialPayload, config?: AxiosRequestConfig): Promise<Credential> {
    // Corresponds to PUT /api/credentials/{id}
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<Credential>(credentialId, cleanedPayload, undefined, config);
  }

  async delete(credentialId: string, config?: AxiosRequestConfig): Promise<{ message: string }> {
    // API Spec indicates 200 OK with message for delete
    const result = await this._delete<{ message: string } | null>(credentialId, undefined, config);
     if (result === null) {
        throw new APIError(`DELETE ${this._getPath(credentialId)} returned null/204, expected 200 with message.`);
    }
    return result;
  }
}

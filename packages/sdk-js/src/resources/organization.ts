import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Organization data structures
interface OrganizationDetails {
  name: string;
  website?: string | null;
  phone?: string | null;
  email?: string | null; // email format
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  logo?: string | null; // URL or base64 data? Check API spec
}

// Same structure for Update payload
type UpdateOrganizationPayload = Partial<OrganizationDetails>;


export class OrganizationResource extends BaseResource {
  // Path is /api/organization/ (single-tenant organization profile).
  protected readonly RESOURCE_PATH = "organization";

  async get(config?: AxiosRequestConfig): Promise<OrganizationDetails> {
    // Corresponds to GET /api/organization/
    // Uses base path GET
    return this._list<OrganizationDetails>(undefined, config);
  }

  async update(payload: UpdateOrganizationPayload, config?: AxiosRequestConfig): Promise<OrganizationDetails> {
    // Corresponds to PUT /api/organization/
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    // Uses base path PUT, call http client directly
    const path = this._getPath();
    return this.httpClient.put<OrganizationDetails>(path, cleanedPayload, config);
  }
}

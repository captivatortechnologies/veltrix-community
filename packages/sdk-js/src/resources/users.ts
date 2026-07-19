import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for User data structures
interface UserSummary { // Based on GET /api/users response
    id: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    phoneNumber?: string | null;
    email: string;
    role: string; // Role name
    customerId: string; // uuid
    authProvider: 'LOCAL' | 'COGNITO' | string; // Allow other potential providers
}

interface CreateUserPayload {
    name: string;
    email: string;
    password?: string; // Required for LOCAL
    roleId: string; // uuid
    customerId: string; // uuid
    authProvider?: 'LOCAL' | 'COGNITO' | string;
}

interface CreateUserResponse { // Based on POST /api/users response
    id: string;
    email: string;
    name: string;
    role: string; // Role name
    customerId: string; // uuid
    authProvider: 'LOCAL' | 'COGNITO' | string;
}

interface ListUsersParams {
    authProvider?: 'LOCAL' | 'COGNITO' | string;
}

export class UsersResource extends BaseResource {
  protected readonly RESOURCE_PATH = "users";

  async list(params?: ListUsersParams, config?: AxiosRequestConfig): Promise<UserSummary[]> {
    // Corresponds to GET /api/users
     const cleanedParams = Object.entries(params || {})
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._list<UserSummary[]>(cleanedParams, config);
  }

  async create(payload: CreateUserPayload, config?: AxiosRequestConfig): Promise<CreateUserResponse> {
    // Corresponds to POST /api/users
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<CreateUserResponse>(cleanedPayload, undefined, config);
  }

  async delete(userId: string, config?: AxiosRequestConfig): Promise<null> {
    // Corresponds to DELETE /api/users/{id}
    // API Spec indicates 204 No Content
    return this._delete<null>(userId, undefined, config);
  }

  // Note: GET /api/users/{id} and PUT /api/users/{id} were not explicitly defined
  // in the server registration or OpenAPI spec provided earlier.
  // If they exist, corresponding get() and update() methods could be added here.
}

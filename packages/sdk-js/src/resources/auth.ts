import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Auth data structures
interface CheckUserResponse {
    exists: boolean;
    authProvider?: string | null;
}

interface LoginPayload {
    email: string;
    password?: string; // Password might not be needed for non-LOCAL auth flows handled elsewhere
}

interface LoginResponse {
    token: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        customerId: string;
    };
}

interface RegisterPayload {
    name: string;
    email: string;
    password?: string; // Required for LOCAL registration
    customerId: string; // uuid
}

interface RegisterResponse {
    id: string;
    email: string;
    name: string;
    // Role might be returned depending on server implementation
}

interface UserProfile {
    id: string;
    email: string;
    name: string;
    role: string;
    customerId: string;
}

interface ChangePasswordPayload {
    currentPassword?: string; // Required for LOCAL password change
    newPassword: string;
}

interface ChangePasswordResponse {
    success: boolean;
    message: string;
}

interface ApiKeyAuthPayload {
    apiKey: string;
    apiKeyId?: string;
}

interface ApiKeyAuthResponse {
    authenticated: boolean;
    customerId?: string;
    type?: string;
    scopes?: string[];
    ownership?: string;
}

interface VerifyApiKeyResponse {
    valid: boolean;
    details?: {
        customerId?: string;
        type?: string;
        scopes?: string[];
        ownership?: string;
    } | null;
}


export class AuthResource extends BaseResource {
  // Auth endpoints don't follow the standard resource pattern
  protected readonly RESOURCE_PATH = "auth";

  async checkUser(email: string, config?: AxiosRequestConfig): Promise<CheckUserResponse> {
    const path = `${this.RESOURCE_PATH}/check-user`;
    const data = { email };
    return this.httpClient.post<CheckUserResponse>(path, data, config);
  }

  async login(payload: LoginPayload, config?: AxiosRequestConfig): Promise<LoginResponse> {
    const path = `${this.RESOURCE_PATH}/login`;
    return this.httpClient.post<LoginResponse>(path, payload, config);
  }

  async register(payload: RegisterPayload, config?: AxiosRequestConfig): Promise<RegisterResponse> {
    const path = `${this.RESOURCE_PATH}/register`;
    return this.httpClient.post<RegisterResponse>(path, payload, config);
  }

  async getMe(config?: AxiosRequestConfig): Promise<UserProfile> {
    const path = `${this.RESOURCE_PATH}/me`;
    // Requires JWT Bearer token auth (handled by HttpClient)
    return this.httpClient.get<UserProfile>(path, config);
  }

  async changePassword(payload: ChangePasswordPayload, config?: AxiosRequestConfig): Promise<ChangePasswordResponse> {
    const path = `${this.RESOURCE_PATH}/change-password`;
     // Requires JWT Bearer token auth
    return this.httpClient.post<ChangePasswordResponse>(path, payload, config);
  }

  // --- API Key Auth Methods ---

  async authenticateApiKey(payload: ApiKeyAuthPayload, config?: AxiosRequestConfig): Promise<ApiKeyAuthResponse> {
    const path = `${this.RESOURCE_PATH}/api-key`;
    return this.httpClient.post<ApiKeyAuthResponse>(path, payload, config);
  }

  async verifyApiKeyHeader(apiKeyId?: string, config?: AxiosRequestConfig): Promise<VerifyApiKeyResponse> {
    const path = `${this.RESOURCE_PATH}/api-key/verify`;
    const headers = config?.headers || {};
    if (apiKeyId) {
        headers['X-API-Key-ID'] = apiKeyId;
    }
    // Assumes API key is in Authorization header via HttpClient config
    return this.httpClient.get<VerifyApiKeyResponse>(path, { ...config, headers });
  }

  async checkApiKeyAuthHeader(config?: AxiosRequestConfig): Promise<ApiKeyAuthResponse> {
     const path = `${this.RESOURCE_PATH}/api-key/check`;
     // Assumes API key is in Authorization header via HttpClient config
     return this.httpClient.get<ApiKeyAuthResponse>(path, config);
  }
}

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Optional AWS Cognito SSO integration. The Community Edition defaults to
// self-hosted local auth; these endpoints are only active when the server's
// Cognito integration is enabled (flagged/optional).

// Define interfaces for Cognito data structures
interface CognitoConfig {
  enabled: boolean;
  userPoolId: string;
  userPoolRegion: string;
  clientId: string;
  clientSecret?: string | null; // Often sensitive, might not be returned
  redirectUri: string;
  logoutUri: string;
  scope: string;
  isCustomerSpecific: boolean;
}

interface SaveCognitoConfigPayload {
  enabled: boolean;
  userPoolId: string;
  clientId: string;
  userPoolRegion?: string;
  clientSecret?: string;
  redirectUri?: string;
  logoutUri?: string;
  scope?: string;
  isCustomerSpecific?: boolean;
}

interface DisableSsoPayload {
    ssoType: string;
}

interface HandleCallbackPayload {
    code: string;
    redirectUri: string;
}

interface HandleCallbackResponse {
    idToken: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

interface TokenExchangePayload {
    idToken: string;
    accessToken: string;
}

interface TokenExchangeResponse {
    token: string; // Veltrix JWT
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        customerId: string;
    };
}

interface CognitoUserAttribute {
    name: string;
    value?: string;
}

interface CognitoUser {
    username?: string;
    status?: string;
    enabled?: boolean;
    userAttributes?: CognitoUserAttribute[];
    email?: string; // Often derived from attributes
    name?: string; // Often derived from attributes
    firstName?: string; // Often derived from attributes
    lastName?: string; // Often derived from attributes
    createdAt?: string; // ISO Date string
    updatedAt?: string; // ISO Date string
}

interface CreateCognitoUserPayload {
    email: string;
    roleId: string | number; // Role ID in Veltrix
    name?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    password?: string; // Temporary password
}


export class CognitoResource extends BaseResource {
  protected readonly RESOURCE_PATH = "cognito";

  async getConfig(config?: AxiosRequestConfig): Promise<CognitoConfig> {
    // Corresponds to GET /api/cognito/
    return this._list<CognitoConfig>(undefined, config); // Use _list for base path GET
  }

  async saveConfig(payload: SaveCognitoConfigPayload, config?: AxiosRequestConfig): Promise<{ success: boolean; message: string }> {
    // Corresponds to POST /api/cognito/config
    const path = `${this.RESOURCE_PATH}/config`;
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.post<{ success: boolean; message: string }>(path, cleanedPayload, config);
  }

  async resetConfig(config?: AxiosRequestConfig): Promise<{ success: boolean; message: string }> {
    // Corresponds to DELETE /api/cognito/config/reset
    const path = `${this.RESOURCE_PATH}/config/reset`;
    // Use http_client directly as base delete expects ID and 204
    const result = await this.httpClient.delete<{ success: boolean; message: string } | null>(path, config);
    if (result === null) {
        throw new APIError(`DELETE ${path} returned null/204, expected 200 with message.`);
    }
    return result;
  }

  async disableForSso(payload: DisableSsoPayload, config?: AxiosRequestConfig): Promise<{ success: boolean; message: string }> {
    // Corresponds to POST /api/cognito/disable-for-sso
    const path = `${this.RESOURCE_PATH}/disable-for-sso`;
    return this.httpClient.post<{ success: boolean; message: string }>(path, payload, config);
  }

  async handleCallback(payload: HandleCallbackPayload, config?: AxiosRequestConfig): Promise<HandleCallbackResponse> {
    // Corresponds to POST /api/cognito/handle-callback
    const path = `${this.RESOURCE_PATH}/handle-callback`;
    return this.httpClient.post<HandleCallbackResponse>(path, payload, config);
  }

  async exchangeToken(payload: TokenExchangePayload, config?: AxiosRequestConfig): Promise<TokenExchangeResponse> {
    // Corresponds to POST /api/cognito/token-exchange
    const path = `${this.RESOURCE_PATH}/token-exchange`;
    return this.httpClient.post<TokenExchangeResponse>(path, payload, config);
  }

  async listCognitoUsers(config?: AxiosRequestConfig): Promise<CognitoUser[]> {
    // Corresponds to GET /api/cognito/cognito-users
    const path = `${this.RESOURCE_PATH}/cognito-users`;
    return this.httpClient.get<CognitoUser[]>(path, config);
  }

  async createCognitoUser(payload: CreateCognitoUserPayload, config?: AxiosRequestConfig): Promise<CognitoUser> {
    // Corresponds to POST /api/cognito/create-user
    const path = `${this.RESOURCE_PATH}/create-user`;
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.post<CognitoUser>(path, cleanedPayload, config);
  }
}

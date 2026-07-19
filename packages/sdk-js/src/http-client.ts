import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { SDK_VERSION } from './version';
import {
  APIError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  RateLimitError,
  BadRequestError,
  ServerError,
  RequestError,
} from './errors';

// Default API base URL for a self-hosted Veltrix Community Edition server.
export const DEFAULT_BASE_URL = 'http://localhost:5000/api';

// Define interfaces for configuration and headers
interface HttpClientConfig {
  apiKey?: string;
  jwtToken?: string;
  customerId?: string;
  baseURL?: string;
  timeout?: number;
}

interface DefaultHeaders {
  Accept: string;
  'Content-Type': string;
  'User-Agent': string;
  Authorization?: string;
  'X-Customer-ID'?: string;
  [key: string]: string | undefined; // Add index signature
}

export class HttpClient {
  private readonly apiKey?: string;
  private readonly jwtToken?: string;
  private customerId?: string; // Allow updating customer ID
  private readonly baseURL: string;
  private readonly timeout: number;
  private readonly axiosInstance: AxiosInstance;

  constructor({
    apiKey,
    jwtToken,
    customerId,
    baseURL = DEFAULT_BASE_URL, // Default base URL
    timeout = 60000, // Default timeout 60 seconds
  }: HttpClientConfig) {
    this.apiKey = apiKey;
    this.jwtToken = jwtToken;
    this.customerId = customerId;
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;

    this.axiosInstance = axios.create({
      baseURL: this.baseURL, // Axios uses this internally
      timeout: this.timeout,
      headers: this._getDefaultHeaders(),
    });
  }

  /**
   * Returns the base URL configured for the HttpClient instance.
   */
  public getBaseUrl(): string {
    return this.baseURL;
  }

  private _getDefaultHeaders(): DefaultHeaders {
    const headers: DefaultHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': `VeltrixTypeScriptSDK/${SDK_VERSION}`,
    };

    if (this.apiKey) {
      headers.Authorization = `ApiKey ${this.apiKey}`;
    } else if (this.jwtToken) {
      headers.Authorization = `Bearer ${this.jwtToken}`;
    }

    if (this.customerId) {
      headers['X-Customer-ID'] = this.customerId;
    }

    return headers;
  }

  // Method to update headers if auth or customerId changes
  private _updateHeaders() {
    this.axiosInstance.defaults.headers.common = this._getDefaultHeaders() as any;
  }

  public setCustomerId(customerId: string | undefined) {
    this.customerId = customerId;
    this._updateHeaders();
  }

  // Note: Setting API key/JWT token after initialization might require
  // creating a new HttpClient instance or carefully managing the Axios instance state.
  // For simplicity, we'll assume they are set at construction for now.

  private _handleError(error: AxiosError): never {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const { status, data, headers } = error.response;
      const requestId = headers['request-id'] || headers['x-request-id'];
      let message = 'An API error occurred';
      let code: string | undefined;
      let errorData: any = data;

      // Try to extract a more specific message from the response body
      if (typeof data === 'object' && data !== null) {
        message = (data as any).error || (data as any).message || message;
        code = (data as any).code; // If the API provides specific error codes
      } else if (typeof data === 'string' && data.length > 0) {
        message = data;
      }

      const errorOptions = { httpStatus: status, requestId, code, errorData };

      switch (status) {
        case 400:
          throw new BadRequestError(message, errorOptions);
        case 401:
          throw new AuthenticationError(message, errorOptions);
        case 403:
          throw new PermissionError(message, errorOptions);
        case 404:
          throw new NotFoundError(message, errorOptions);
        case 429:
          throw new RateLimitError(message, errorOptions);
        case 500:
        case 501:
        case 502:
        case 503:
        case 504:
          throw new ServerError(message, errorOptions);
        default:
          throw new APIError(message || `API responded with status ${status}`, errorOptions);
      }
    } else if (error.request) {
      // The request was made but no response was received
      throw new RequestError('No response received from the server. Check network connectivity.', { errorData: error });
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new RequestError(`Request setup failed: ${error.message}`, { errorData: error });
    }
  }

  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.request<T>(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this._handleError(error);
      } else {
        // Rethrow non-Axios errors
        throw error;
      }
    }
  }

  async get<T = any>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url: path });
  }

  async post<T = any>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'POST', url: path, data });
  }

  async put<T = any>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'PUT', url: path, data });
  }

  async patch<T = any>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'PATCH', url: path, data });
  }

  async delete<T = any>(path: string, config?: AxiosRequestConfig): Promise<T | null> {
    // DELETE might return 204 No Content, handle appropriately
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.request<T>({ ...config, method: 'DELETE', url: path });
      // Axios considers 204 a success, but response.data might be undefined/null
      return response.status === 204 ? null : response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // If the error is 404 for a DELETE, maybe treat it as success (idempotent)
        // Or let _handleError decide based on status code
        this._handleError(error);
      } else {
        throw error;
      }
    }
  }
}

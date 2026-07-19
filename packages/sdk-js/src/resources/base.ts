import { HttpClient } from '../http-client';
import { AxiosRequestConfig } from 'axios';

export abstract class BaseResource {
  protected readonly httpClient: HttpClient;
  // Subclasses must define their specific resource path segment
  protected abstract readonly RESOURCE_PATH: string;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    if (this.constructor === BaseResource) {
      throw new Error('BaseResource cannot be instantiated directly. Subclasses must define RESOURCE_PATH.');
    }
  }

  protected _getPath(resourceId?: string | number, action?: string): string {
    let path = this.RESOURCE_PATH;
    if (resourceId !== undefined && resourceId !== null) {
      path = `${path}/${resourceId}`;
    }
    if (action) {
      path = `${path}/${action}`;
    }
    return path;
  }

  protected async _list<T = any>(params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath();
    return this.httpClient.get<T>(path, { ...config, params });
  }

  protected async _get<T = any>(resourceId: string | number, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath(resourceId);
    return this.httpClient.get<T>(path, { ...config, params });
  }

  protected async _create<T = any>(data: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath();
    return this.httpClient.post<T>(path, data, { ...config, params });
  }

  protected async _update<T = any>(resourceId: string | number, data: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath(resourceId);
    return this.httpClient.put<T>(path, data, { ...config, params });
  }

  protected async _patch<T = any>(resourceId: string | number, data: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath(resourceId);
    return this.httpClient.patch<T>(path, data, { ...config, params });
  }

  protected async _delete<T = any>(resourceId: string | number, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T | null> {
    const path = this._getPath(resourceId);
    return this.httpClient.delete<T>(path, { ...config, params });
  }

  protected async _action<T = any>(resourceId: string | number, action: string, method: 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE' = 'POST', data?: any, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
    const path = this._getPath(resourceId, action);
    return this.httpClient.request<T>({ ...config, method, url: path, data, params });
  }
}

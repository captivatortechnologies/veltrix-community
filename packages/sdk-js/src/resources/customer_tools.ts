import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Per-tenant tool enablement (/api/customers/{customerId}/tools).

interface AddCustomerToolPayload {
  toolId: string;
  [key: string]: any;
}

export class CustomerToolsResource extends BaseResource {
  protected readonly RESOURCE_PATH = 'customers';

  /** Lists the tools configured for a customer. GET /api/customers/{customerId}/tools */
  async list(customerId: string, config?: AxiosRequestConfig): Promise<any[]> {
    const path = `${this.RESOURCE_PATH}/${customerId}/tools`;
    return this.httpClient.get<any[]>(path, config);
  }

  /** Adds a tool to a customer's configured tools. POST /api/customers/{customerId}/tools */
  async add(customerId: string, payload: AddCustomerToolPayload, config?: AxiosRequestConfig): Promise<any> {
    const path = `${this.RESOURCE_PATH}/${customerId}/tools`;
    return this.httpClient.post<any>(path, payload, config);
  }

  /** Removes a tool from a customer's configured tools. DELETE /api/customers/{customerId}/tools/{toolId} */
  async remove(customerId: string, toolId: string, config?: AxiosRequestConfig): Promise<any | null> {
    const path = `${this.RESOURCE_PATH}/${customerId}/tools/${toolId}`;
    return this.httpClient.delete<any>(path, config);
  }
}

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Define interfaces for Log Forwarding data structures
type LogForwardingType = 'splunk' | 'elasticsearch' | 'datadog' | 'sumologic' | 'custom';
type LogForwardingStatus = 'active' | 'inactive' | 'error';

interface LogForwardingDestination {
  id: string; // uuid
  name: string;
  type: LogForwardingType;
  endpoint: string;
  status: LogForwardingStatus;
  error?: string | null;
  lastSync?: string | null; // ISO Date string
  customerId: string; // uuid
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface CreateLogForwardingPayload {
  name: string;
  type: LogForwardingType;
  endpoint: string;
}

interface UpdateLogForwardingPayload {
  name?: string;
  type?: LogForwardingType;
  endpoint?: string;
  status?: LogForwardingStatus;
}

interface TestLogForwardingResponse {
    success: boolean;
    message: string;
}

export class LogForwardingResource extends BaseResource {
  protected readonly RESOURCE_PATH = "log-forwarding"; // Note hyphen

  async list(config?: AxiosRequestConfig): Promise<LogForwardingDestination[]> {
    // Corresponds to GET /api/log-forwarding
    return this._list<LogForwardingDestination[]>(undefined, config);
  }

  async create(payload: CreateLogForwardingPayload, config?: AxiosRequestConfig): Promise<LogForwardingDestination> {
    // Corresponds to POST /api/log-forwarding
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<LogForwardingDestination>(cleanedPayload, undefined, config);
  }

  // GET /api/log-forwarding/{id} is missing from spec, skipping get() method

  async update(destinationId: string, payload: UpdateLogForwardingPayload, config?: AxiosRequestConfig): Promise<LogForwardingDestination> {
    // Corresponds to PUT /api/log-forwarding/{id}
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._update<LogForwardingDestination>(destinationId, cleanedPayload, undefined, config);
  }

  async delete(destinationId: string, config?: AxiosRequestConfig): Promise<{ message: string }> {
    // Corresponds to DELETE /api/log-forwarding/{id}
    // API Spec indicates 200 OK with message for delete
     const result = await this._delete<{ message: string } | null>(destinationId, undefined, config);
     if (result === null) {
        throw new APIError(`DELETE ${this._getPath(destinationId)} returned null/204, expected 200 with message.`);
    }
    return result;
  }

  async test(destinationId: string, config?: AxiosRequestConfig): Promise<TestLogForwardingResponse> {
    // Corresponds to POST /api/log-forwarding/{id}/test
    const action = "test";
    // Use _action helper as it's a POST to a sub-path with no body
    return this._action<TestLogForwardingResponse>(destinationId, action, 'POST', undefined, undefined, config);
  }
}

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';
import { APIError } from '../errors';

// Define interfaces for Log Entry data structures
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  id: string; // uuid
  timestamp: string; // ISO Date string
  level: LogLevel;
  source: string;
  message: string;
  details?: string | null;
  customerId: string; // uuid
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
}

interface CreateLogEntryPayload {
  level: LogLevel;
  source: string;
  message: string;
  details?: string | null;
}

interface ListLogEntriesParams {
    page?: number;
    limit?: number;
    level?: LogLevel;
    source?: string;
    fromDate?: string; // ISO Date string
    toDate?: string; // ISO Date string
}

export class LogEntriesResource extends BaseResource {
  protected readonly RESOURCE_PATH = "logs";

  async list(params?: ListLogEntriesParams, config?: AxiosRequestConfig): Promise<LogEntry[]> {
    // Corresponds to GET /api/logs
    const cleanedParams = Object.entries(params || {})
        .filter(([_, value]) => value !== undefined && value !== null)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._list<LogEntry[]>(cleanedParams, config);
  }

  async create(payload: CreateLogEntryPayload, config?: AxiosRequestConfig): Promise<LogEntry> {
    // Corresponds to POST /api/logs
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this._create<LogEntry>(cleanedPayload, undefined, config);
  }

  async get(logId: string, config?: AxiosRequestConfig): Promise<LogEntry> {
    // Corresponds to GET /api/logs/{id}
    return this._get<LogEntry>(logId, undefined, config);
  }

  async delete(logId: string, config?: AxiosRequestConfig): Promise<{ message: string }> {
    // Corresponds to DELETE /api/logs/{id}
    // API Spec indicates 200 OK with message for delete
     const result = await this._delete<{ message: string } | null>(logId, undefined, config);
     if (result === null) {
        throw new APIError(`DELETE ${this._getPath(logId)} returned null/204, expected 200 with message.`);
    }
    return result;
  }

  async getSources(config?: AxiosRequestConfig): Promise<string[]> {
    // Corresponds to GET /api/logs/sources
    const path = `${this.RESOURCE_PATH}/sources`;
    return this.httpClient.get<string[]>(path, config);
  }

  async getLevels(config?: AxiosRequestConfig): Promise<LogLevel[]> {
    // Corresponds to GET /api/logs/levels
    const path = `${this.RESOURCE_PATH}/levels`;
    return this.httpClient.get<LogLevel[]>(path, config);
  }
}

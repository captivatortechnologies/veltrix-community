import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  details: string | null;
}

export interface LogFilter {
  page?: number;
  limit?: number;
  level?: string;
  source?: string;
  fromDate?: string;
  toDate?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

// Get all log entries with pagination and filtering
export const getLogEntries = async (filters: LogFilter = {}): Promise<PaginatedResponse<LogEntry>> => {
  try {
    const { page = 1, limit = 20, level, source, fromDate, toDate } = filters;
    
    // Build query parameters
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    
    if (level) params.append('level', level);
    if (source) params.append('source', source);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    
    const response = await authAxios.get(`${API_URL}/logs?${params.toString()}`);
    
    // Extract pagination headers
    const totalCount = parseInt(response.headers['x-total-count'] || '0', 10);
    const totalPages = parseInt(response.headers['x-total-pages'] || '0', 10);
    const currentPage = parseInt(response.headers['x-current-page'] || '0', 10);
    
    return {
      data: response.data,
      totalCount,
      totalPages,
      currentPage
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch log entries');
  }
};

// Get log entry by ID
export const getLogEntryById = async (id: number): Promise<LogEntry> => {
  try {
    const response = await authAxios.get(`${API_URL}/logs/${id}`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch log entry');
  }
};

// Create a new log entry
export const createLogEntry = async (data: {
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  details?: string;
}): Promise<LogEntry> => {
  try {
    const response = await authAxios.post(`${API_URL}/logs`, data);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to create log entry');
  }
};

// Delete a log entry
export const deleteLogEntry = async (id: number): Promise<void> => {
  try {
    await authAxios.delete(`${API_URL}/logs/${id}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to delete log entry');
  }
};

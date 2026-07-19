import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface LogForwardingDestination {
  id: number;
  name: string;
  type: 'splunk' | 'elasticsearch' | 'datadog' | 'sumologic' | 'custom';
  endpoint: string;
  status: 'active' | 'inactive' | 'error';
  lastSync: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// Get all log forwarding destinations
export const getLogForwardingDestinations = async (): Promise<LogForwardingDestination[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/log-forwarding`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch log forwarding destinations');
  }
};

// Create a new log forwarding destination
export const createLogForwardingDestination = async (data: {
  name: string;
  type: 'splunk' | 'elasticsearch' | 'datadog' | 'sumologic' | 'custom';
  endpoint: string;
}): Promise<LogForwardingDestination> => {
  try {
    const response = await authAxios.post(`${API_URL}/log-forwarding`, data);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to create log forwarding destination');
  }
};

// Update a log forwarding destination
export const updateLogForwardingDestination = async (
  id: number,
  data: Partial<{
    name: string;
    type: 'splunk' | 'elasticsearch' | 'datadog' | 'sumologic' | 'custom';
    endpoint: string;
    status: 'active' | 'inactive' | 'error';
  }>
): Promise<LogForwardingDestination> => {
  try {
    const response = await authAxios.put(`${API_URL}/log-forwarding/${id}`, data);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update log forwarding destination');
  }
};

// Delete a log forwarding destination
export const deleteLogForwardingDestination = async (id: number): Promise<void> => {
  try {
    await authAxios.delete(`${API_URL}/log-forwarding/${id}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to delete log forwarding destination');
  }
};

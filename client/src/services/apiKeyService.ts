import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  type: 'api' | 'admin' | 'webhook';
  createdAt: string;
  lastUsed: string | null;
  expiresAt: string | null;
  revoked?: boolean;
  /** RBAC role that governs this key's permissions. */
  roleId?: string | null;
  roleName?: string | null;
}

// Get all API keys
export const getApiKeys = async (): Promise<ApiKey[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/api-keys`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch API keys');
  }
};

// Create a new API key
export const createApiKey = async (data: {
  name: string;
  type: 'api' | 'admin';
  expiresAt?: string;
  roleId?: string;
}): Promise<ApiKey> => {
  try {
    const response = await authAxios.post(`${API_URL}/api-keys`, data);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to create API key');
  }
};

// Delete an API key
export const deleteApiKey = async (id: string): Promise<void> => {
  try {
    await authAxios.delete(`${API_URL}/api-keys/${id}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to delete API key');
  }
};

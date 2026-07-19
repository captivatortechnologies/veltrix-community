import axios from 'axios';

// Define types for TailScale API
export interface TailscaleDevice {
  id: string;
  hostname: string;
  ipAddress: string;
  preAuthKey: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TailscaleACLPolicy {
  acls: Array<{
    action: string;
    users: string[];
    ports: string[];
  }>;
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
}

// Get API URL from environment variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Helper function to get auth token from localStorage or sessionStorage
const getAuthToken = () => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

// Helper function to get customer ID from localStorage or sessionStorage
const getCustomerId = (): string | null => {
  try {
    // First try to get customerId directly
    const directCustomerId = localStorage.getItem('customerId');
    if (directCustomerId) {
      return directCustomerId;
    }

    // If not found, try to extract from user object (check both storages)
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user && user.customerId) {
        return user.customerId;
      }
    }

    // If still not found, use default customer ID
    return "00000000-0000-0000-0000-000000000001";
  } catch (error) {
    console.error('Error getting customerId:', error);
    return null;
  }
};

// Configure axios instance with auth headers
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token and customer ID in every request
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    const customerId = getCustomerId();
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (customerId) {
      config.headers['X-Customer-ID'] = customerId;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle authentication errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized errors
    if (error.response && error.response.status === 401) {
      console.error('Authentication error: Token expired or invalid');
      
      // You could dispatch an event or use a global state management solution
      // to handle authentication errors app-wide
      const authErrorEvent = new CustomEvent('auth-error', {
        detail: { message: 'Your session has expired. Please refresh the page and log in again.' }
      });
      window.dispatchEvent(authErrorEvent);
      
      // Return a more descriptive error
      return Promise.reject({
        ...error,
        isAuthError: true,
        message: 'Your session has expired. Please refresh the page and log in again.'
      });
    }
    
    return Promise.reject(error);
  }
);

// TailScale API
export const tailscaleApi = {
  // Configuration management
  getConfig: async () => {
    try {
      const response = await api.get('/tailscale-config');
      return response.data;
    } catch (error) {
      console.error('Error getting Tailscale config:', error);
      throw error;
    }
  },
  
  checkConfig: async () => {
    try {
      const response = await api.get('/tailscale/config');
      return response.data;
    } catch (error) {
      console.error('Error checking Tailscale config:', error);
      throw error;
    }
  },
  
  upsertConfig: async (configData: {
    apiUrl?: string;
    tailnet: string;
    apiKey: string;
  }) => {
    try {
      const response = await api.post('/tailscale-config', configData);
      return response.data;
    } catch (error) {
      console.error('Error updating Tailscale config:', error);
      throw error;
    }
  },
  
  deleteConfig: async () => {
    try {
      const response = await api.delete('/tailscale-config');
      return response.data;
    } catch (error) {
      console.error('Error deleting Tailscale config:', error);
      throw error;
    }
  },
  
  // Device management
  getAllDevices: async () => {
    try {
      const response = await api.get('/tailscale/devices');
      return response.data;
    } catch (error) {
      console.error('Error getting Tailscale devices:', error);
      throw error;
    }
  },
  
  getDeviceById: async (deviceId: string) => {
    try {
      const response = await api.get(`/tailscale/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting Tailscale device ${deviceId}:`, error);
      throw error;
    }
  },
  
  createDevice: async (deviceData: {
    hostname: string;
    ipAddress: string;
    tags?: string[];
    description?: string;
  }) => {
    try {
      const response = await api.post('/tailscale/devices', deviceData);
      return response.data;
    } catch (error) {
      console.error('Error creating Tailscale device:', error);
      throw error;
    }
  },
  
  deleteDevice: async (deviceId: string) => {
    try {
      const response = await api.delete(`/tailscale/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting Tailscale device ${deviceId}:`, error);
      throw error;
    }
  },
  
  // Key management
  generateKey: async (keyData: {
    componentId: string;
    customerId?: string;
    reusable?: boolean;
    ephemeral?: boolean;
    description?: string;
  }) => {
    try {
      // If customerId is not provided, get it from localStorage
      if (!keyData.customerId) {
        keyData.customerId = getCustomerId() || undefined;
      }
      
      console.log('Generating key with data:', keyData);
      const response = await api.post('/tailscale/keys', keyData);
      return response.data;
    } catch (error) {
      console.error('Error generating Tailscale key:', error);
      throw error;
    }
  },
  
  revokeKey: async (keyId: string) => {
    try {
      const response = await api.delete(`/tailscale/keys/${keyId}`);
      return response.data;
    } catch (error) {
      console.error(`Error revoking Tailscale key ${keyId}:`, error);
      throw error;
    }
  },
  
  // ACL management
  getACL: async () => {
    try {
      const response = await api.get('/tailscale/acl');
      return response.data;
    } catch (error) {
      console.error('Error getting Tailscale ACL:', error);
      throw error;
    }
  },
  
  updateACL: async (aclPolicy: TailscaleACLPolicy) => {
    try {
      const response = await api.post('/tailscale/acl', aclPolicy);
      return response.data;
    } catch (error) {
      console.error('Error updating Tailscale ACL:', error);
      throw error;
    }
  }
};

// Add a global event listener for authentication errors
window.addEventListener('auth-error', (event: Event) => {
  const customEvent = event as CustomEvent;
  console.error('Authentication error event:', customEvent.detail);
  
  // You could show a global notification or redirect to login page
  // For now, we'll just log the error
});

export default tailscaleApi;

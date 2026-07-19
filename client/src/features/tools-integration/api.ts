import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Helper function to get auth token from localStorage or sessionStorage
const getAuthToken = () => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

// Helper function to get customer ID from localStorage or sessionStorage
const getCustomerId = () => {
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!userStr) return null;

  try {
    const user = JSON.parse(userStr);
    return user.customerId;
  } catch {
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

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth data from both storages and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/login?expired=true';
    }

    return Promise.reject(error);
  }
);

// Tag API
export const tagApi = {
  getAllTags: async () => {
    const response = await api.get('/tags');
    return response.data;
  },
  
  createTag: async (name: string) => {
    const response = await api.post('/tags', { name });
    return response.data;
  },
  
  updateTag: async (id: string, name: string) => {
    const response = await api.put(`/tags/${id}`, { name });
    return response.data;
  },
  
  deleteTag: async (id: string) => {
    const response = await api.delete(`/tags/${id}`);
    return response.data;
  }
};

// Credential API
export const credentialApi = {
  getCredentialsByToolId: async (toolId: string) => {
    const response = await api.get(`/tools/${toolId}/credentials`);
    return response.data;
  },
  
  createCredential: async (credentialData: {
    name: string;
    username: string;
    password: string;
    apiToken?: string;
    certificate?: string;
    type?: string;
    toolId: string;
    tagIds: string[];
  }) => {
    try {
      // Ensure tagIds is never undefined and is properly formatted
      const data = {
        ...credentialData,
        tagIds: credentialData.tagIds || []
      };
      const response = await api.post('/credentials', data);
      return response.data;
    } catch (error) {
      console.error('Error creating credential:', error);
      throw error;
    }
  },
  
  updateCredential: async (id: string, credentialData: {
    name?: string;
    username?: string;
    password?: string;
    apiToken?: string;
    certificate?: string;
    type?: string;
    tagIds?: string[];
  }) => {
    try {
      // Ensure tagIds is properly formatted if provided
      const data = {
        ...credentialData,
        tagIds: credentialData.tagIds || []
      };
      const response = await api.put(`/credentials/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating credential:', error);
      throw error;
    }
  },
  
  deleteCredential: async (id: string) => {
    const response = await api.delete(`/credentials/${id}`);
    return response.data;
  }
};

// Component API
export const componentApi = {
  getAllComponents: async () => {
    const response = await api.get('/components');
    return response.data;
  },
  
  getComponentsByToolId: async (toolId: string) => {
    const response = await api.get(`/tools/${toolId}/components`);
    return response.data;
  },
  
  getStacksByToolId: async (toolId: string) => {
    const response = await api.get(`/tools/${toolId}/components?type=stack`);
    return response.data;
  },
  
  createComponent: async (componentData: {
    type: string[]; // Expect array
    hostname: string;
    port: string;
    toolId: string;
    tagIds: string[];
  }) => {
    try {
      // Ensure tagIds is never undefined
      const data = {
        ...componentData,
        type: componentData.type, // Send the array
        tagIds: componentData.tagIds || []
      };
      const response = await api.post('/components', data);
      return response.data;
    } catch (error) {
      console.error('Error creating component:', error);
      throw error;
    }
  },
  
  createStack: async (stackData: {
    name: string;
    toolId: string;
    tagIds: string[];
  }) => {
    try {
      // For stacks, we use the Component table with type='stack' and hostname=name
      const componentData = {
        type: 'stack', // Use string instead of array to match backend expectation
        hostname: stackData.name,
        port: '0', // Not used for stacks
        toolId: stackData.toolId,
        tagIds: stackData.tagIds || [] // Ensure tagIds is never undefined
      };
      const response = await api.post('/components', componentData);
      return response.data;
    } catch (error) {
      console.error('Error creating stack:', error);
      throw error;
    }
  },
  
  updateComponent: async (id: string, componentData: {
    type?: string[]; // Expect array
    hostname?: string;
    port?: string;
    tagIds?: string[];
  }) => {
    try {
      // Ensure tagIds is properly formatted if provided
      const data = {
        ...componentData,
        type: componentData.type, // Send the array
        tagIds: componentData.tagIds || []
      };
      const response = await api.put(`/components/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating component:', error);
      throw error;
    }
  },
  
  updateStack: async (id: string, stackData: {
    name?: string;
    tagIds?: string[];
  }) => {
    try {
      // For stacks, we update the hostname field with the stack name
      const componentData = {
        hostname: stackData.name,
        tagIds: stackData.tagIds || []
      };
      const response = await api.put(`/components/${id}`, componentData);
      return response.data;
    } catch (error) {
      console.error('Error updating stack:', error);
      throw error;
    }
  },
  
  deleteComponent: async (id: string) => {
    const response = await api.delete(`/components/${id}`);
    return response.data;
  },
  
  deleteStack: async (id: string) => {
    // Stacks are just components with type='stack'
    return await componentApi.deleteComponent(id);
  },

  assignProvider: async (componentIds: string[], connectivityProviderId: string | null): Promise<{ updated: number }> => {
    const response = await api.post('/components/assign-provider', { componentIds, connectivityProviderId });
    return response.data;
  }
};

// Connectivity API
export const connectivityApi = {
  getConnectivityByComponentId: async (componentId: string) => {
    const response = await api.get(`/connectivity/component/${componentId}`);
    return response.data;
  },
  
  createOrUpdateConnectivity: async (connectivityData: {
    componentId: string;
    status?: string;
    sshCommand?: string;
    httpsUrl?: string;
  }) => {
    const response = await api.post('/connectivity', connectivityData);
    return response.data;
  },
  
  updateConnectivity: async (componentId: string, connectivityData: {
    status?: string;
    sshCommand?: string;
    httpsUrl?: string;
    tailscaleKey?: string;
  }) => {
    const response = await api.put(`/connectivity/component/${componentId}`, connectivityData);
    return response.data;
  },
  
  deleteConnectivity: async (componentId: string) => {
    const response = await api.delete(`/connectivity/component/${componentId}`);
    return response.data;
  },
  
  regenerateTailscaleKey: async (componentId: string) => {
    const response = await api.post(`/connectivity/component/${componentId}/regenerate-key`);
    return response.data;
  }
};

// Tools API
export const toolsApi = {
  getAllTools: async (filters?: {
    vendor?: string;
    category?: string;
    search?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.vendor) params.append('vendor', filters.vendor);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.search) params.append('search', filters.search);
    
    const response = await api.get(`/tools?${params.toString()}`);
    return response.data;
  },
  
  getToolById: async (id: string) => {
    const response = await api.get(`/tools/${id}`);
    return response.data;
  },
  
  getVendors: async () => {
    const response = await api.get('/tools/vendors');
    return response.data;
  },
  
  getCategories: async () => {
    const response = await api.get('/tools/categories');
    return response.data;
  },
  
  createTool: async (toolData: {
    name: string;
    description: string;
    vendor: string;
    category: string;
    logoUrl?: string;
  }) => {
    const response = await api.post('/tools', toolData);
    return response.data;
  },
  
  updateTool: async (id: string, toolData: {
    name?: string;
    description?: string;
    vendor?: string;
    category?: string;
    logoUrl?: string;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/tools/${id}`, toolData);
    return response.data;
  },
  
  deleteTool: async (id: string) => {
    const response = await api.delete(`/tools/${id}`);
    return response.data;
  }
};

/** Raw user shape returned by the /users and /cognito/cognito-users endpoints. */
interface RawDirectoryUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  /** Local users carry a role object; Cognito users may carry a plain string. */
  role?: { name?: string } | string;
}

// User API
export const userApi = {
  getAllUsers: async () => {
    try {
      // Array to store all users
      let allUsers: RawDirectoryUser[] = [];

      try {
        // Get local users
        const localUsersResponse = await api.get<RawDirectoryUser[]>('/users?authProvider=LOCAL');
        const localUsers = localUsersResponse.data || [];

        allUsers = [...localUsers];
      } catch (localError) {
        console.error('Error fetching local users:', localError);
      }
      
      try {
        // Get Cognito users
        const cognitoUsersResponse = await api.get<RawDirectoryUser[]>('/cognito/cognito-users');
        const cognitoUsers = cognitoUsersResponse.data || [];
        
        // Add Cognito users if we got a valid response
        if (Array.isArray(cognitoUsers)) {
          allUsers = [...allUsers, ...cognitoUsers];
        }
      } catch (cognitoError) {
        console.error('Error fetching Cognito users:', cognitoError);
        // Typically this might be an authentication error or Cognito not configured
      }
      
      // Format all users consistently
      return allUsers.map(user => ({
        id: user.id,
        name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email.split('@')[0],
        email: user.email,
        role: (typeof user.role === 'string' ? user.role : user.role?.name) || 'User'
      }));
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return [];
    }
  },
  
  searchUsers: async (query: string) => {
    if (!query.trim()) return [];
    
    try {
      // Get all users first
      const allUsers = await userApi.getAllUsers();
      
      // Client-side filtering
      return allUsers.filter(user => {
        const searchTerm = query.toLowerCase();
        return (
          (user.name && user.name.toLowerCase().includes(searchTerm)) ||
          (user.email && user.email.toLowerCase().includes(searchTerm)) ||
          (user.role && user.role.toLowerCase().includes(searchTerm))
        );
      });
    } catch (error) {
      console.error('Error searching users:', error);
      return [];
    }
  }
};

// === Configuration History API ===

// Define the expected structure for a history item from the API
// (Should match the backend response structure)
export interface ApiHistoryItem { // Ensure this interface is exported
  id: string; 
  timestamp: string;
  action: string; // Consider using the enum string values ('CREATED', 'UPDATED', etc.)
  deployState: string; // Consider using the enum string values ('PENDING', 'DEPLOYED', etc.)
  entityType: string; 
  entityId: string; 
  entityName?: string | null;
  details?: Record<string, unknown> | null; // Use Record<string, unknown> for a structured JSON object
  status?: string; // Add status field (e.g., 'pending approval', 'deployed')
  userId: string;
  customerId: string; // Assuming backend includes this
  user?: { // Optional user details
    id: string;
    name?: string | null;
    email: string;
  } | null;
  createdBy?: { // Add the createdBy field based on schema
    id: string;
    name?: string | null;
    email: string;
  } | null;
}

export const historyApi = { // Ensure this const is exported
  /**
   * Fetch configuration history entries.
   * TODO: Add filter parameters (entityType, entityId, dateRange, userId, limit, offset)
   */
  getHistory: async (/* filters = {} */): Promise<ApiHistoryItem[]> => {
    try {
      // TODO: Construct query parameters based on filters
      // const params = new URLSearchParams();
      // if (filters.entityType) params.append('entityType', filters.entityType);
      // ... add other filters

      // Use the configured axios instance 'api'
      const response = await api.get('/configuration-history' /* `?${params.toString()}` */);

      // Handle paginated response format
      const responseData = response.data;

      // Check if response is paginated format {data: [], total: number, ...}
      if (responseData && typeof responseData === 'object' && Array.isArray(responseData.data)) {
        return responseData.data as ApiHistoryItem[];
      }

      // Fallback for raw array format
      if (Array.isArray(responseData)) {
        return responseData as ApiHistoryItem[];
      }

      console.error('Invalid history data received:', responseData);
      throw new Error('Received invalid data format for history.');
    } catch (error) {
      console.error('Error fetching configuration history:', error);
      // Re-throw or return empty array based on desired error handling
      throw error;
    }
  },
  
  // Add createHistoryEntry if needed for frontend logging (less common)
  // createHistoryEntry: async (entryData) => { ... }
};


export default {
  tagApi,
  credentialApi,
  componentApi,
  connectivityApi,
  toolsApi,
  userApi,
  historyApi // Add the new API object here
};

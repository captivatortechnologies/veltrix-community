// API module for tag and user management
import { API_URL } from '@/config';

interface Tag {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Tag API functions
export const tagApi = {
  // Get all tags from the server
  getAllTags: async (): Promise<Tag[]> => {
    try {
      console.log('Fetching tags from API...');
      
      // Get the authentication token from localStorage (if available)
      const token = localStorage.getItem('authToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add the auth token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Make the request with auth headers
      const response = await fetch(`${API_URL}/tags`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        console.error(`Tag API error: ${response.status} ${response.statusText}`);
        if (response.status === 401 || response.status === 403) {
          console.warn('Authentication error fetching tags');
        }
        throw new Error(`Error fetching tags: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched tags:', data);
      return data;
    } catch (error) {
      console.error('Error fetching tags:', error);
      return []; // Return empty array instead of throwing to prevent cascading failures
    }
  },

  // Get tag by ID
  getTagById: async (id: string): Promise<Tag | null> => {
    try {
      const tags = await tagApi.getAllTags();
      return tags.find(tag => tag.id === id) || null;
    } catch (error) {
      console.error(`Error fetching tag with ID ${id}:`, error);
      throw error;
    }
  },

  // Create tag (mock implementation)
  createTag: async (tagData: Omit<Tag, 'id'>): Promise<Tag> => {
    // In a real implementation, you would make a POST request to create the tag
    return {
      id: `tag-${Date.now()}`,
      ...tagData
    };
  }
};

// User API functions
export const userApi = {
  // Get all users from server
  getAllUsers: async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_URL}/users`);
      
      if (!response.ok) {
        throw new Error(`Error fetching users: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Search users by query
  searchUsers: async (query: string): Promise<User[]> => {
    try {
      const response = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`Error searching users: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }
};

// Credential API functions
export const credentialApi = {
  getCredentialsByToolId: async (toolId: string) => {
    try {
      console.log(`Fetching credentials for tool ${toolId}...`);
      
      // Get the authentication token from localStorage (if available)
      const token = localStorage.getItem('authToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add the auth token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Make the request with auth headers
      const response = await fetch(`${API_URL}/tools/${toolId}/credentials`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        console.error(`Credentials API error: ${response.status} ${response.statusText}`);
        if (response.status === 401 || response.status === 403) {
          console.warn('Authentication error fetching credentials');
          return []; // Return empty array instead of null for auth errors
        }
        throw new Error(`Error fetching credentials: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched credentials');
      return data || []; // Ensure we always return an array
    } catch (error) {
      console.error(`Error fetching credentials for tool ${toolId}:`, error);
      // Return empty array instead of null to prevent map errors
      return [];
    }
  }
};

// Component API functions
export const componentApi = {
  getComponentsByToolId: async (toolId: string) => {
    try {
      console.log(`Fetching components for tool ${toolId}...`);
      
      // Get the authentication token from localStorage (if available)
      const token = localStorage.getItem('authToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add the auth token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/tools/${toolId}/components`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        console.error(`Components API error: ${response.status} ${response.statusText}`);
        if (response.status === 401 || response.status === 403) {
          console.warn('Authentication error fetching components');
          return []; // Return empty array instead of throwing for auth errors
        }
        throw new Error(`Error fetching components: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched components');
      return data || []; // Ensure we always return an array
    } catch (error) {
      console.error(`Error fetching components for tool ${toolId}:`, error);
      // Return empty array instead of throwing to prevent map errors
      return [];
    }
  }
};

// Tools API functions
export const toolsApi = {
  getToolById: async (toolId: string) => {
    try {
      console.log(`Fetching tool with ID ${toolId}...`);
      
      // Get the authentication token from localStorage (if available)
      const token = localStorage.getItem('authToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add the auth token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/tools/${toolId}`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        console.error(`Tools API error: ${response.status} ${response.statusText}`);
        if (response.status === 401 || response.status === 403) {
          console.warn('Authentication error fetching tool');
          return null; // Return null for auth errors
        }
        throw new Error(`Error fetching tool: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched tool');
      return data;
    } catch (error) {
      console.error(`Error fetching tool ${toolId}:`, error);
      return null; // Return null instead of throwing to prevent cascading failures
    }
  },
  
  getAllTools: async () => {
    try {
      console.log('Fetching all tools...');
      
      // Get the authentication token from localStorage (if available)
      const token = localStorage.getItem('authToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add the auth token if available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/tools`, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        console.error(`Tools API error: ${response.status} ${response.statusText}`);
        if (response.status === 401 || response.status === 403) {
          console.warn('Authentication error fetching tools');
          return []; // Return empty array for auth errors
        }
        throw new Error(`Error fetching tools: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched tools');
      return data || []; // Ensure we always return an array
    } catch (error) {
      console.error('Error fetching tools:', error);
      return []; // Return empty array instead of throwing to prevent cascading failures
    }
  }
};

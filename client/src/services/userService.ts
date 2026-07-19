import { authAxios } from './authService';
import { User } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Get all local users (authProvider = 'LOCAL')
export const getLocalUsers = async (): Promise<User[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/users?authProvider=LOCAL`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch local users');
  }
};

// Get user by ID
export const getUserById = async (userId: string | number): Promise<User> => {
  try {
    const response = await authAxios.get(`${API_URL}/users/${userId}`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error(`Failed to fetch user with ID ${userId}`);
  }
};

// Create new user
export const createUser = async (userData: {
  name?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email: string;
  password: string;
  roleId: string | number;
  authProvider?: string;
}): Promise<User> => {
  try {
    // Get the customer ID from localStorage
    const customerId = localStorage.getItem('customerId') || "00000000-0000-0000-0000-000000000001";
    
    // Add customerId to userData
    const userDataWithCustomerId = {
      ...userData,
      customerId
    };
    
    const response = await authAxios.post(`${API_URL}/users`, userDataWithCustomerId);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to create user');
  }
};

// Update user
export const updateUser = async (
  userId: string | number,
  userData: {
    name?: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    email?: string;
    roleId?: string | number;
  }
): Promise<User> => {
  try {
    const response = await authAxios.put(`${API_URL}/users/${userId}`, userData);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error(`Failed to update user with ID ${userId}`);
  }
};

// Delete user
export const deleteUser = async (userId: string | number): Promise<void> => {
  try {
    await authAxios.delete(`${API_URL}/users/${userId}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error(`Failed to delete user with ID ${userId}`);
  }
};

// Get all roles
export const getRoles = async (): Promise<{ id: string; name: string }[]> => {
  try {
    const response = await authAxios.get(`${API_URL}/roles`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch roles');
  }
};

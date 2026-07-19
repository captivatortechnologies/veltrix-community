import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization?: string;
  phone?: string;
  location?: string;
  joinDate?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface UserSettings {
  id: string;
  notifications: {
    email: boolean;
    browser: boolean;
    mobile: boolean;
  };
  twoFactorEnabled: boolean;
}

// Get user profile
export const getProfile = async (): Promise<UserProfile> => {
  try {
    const response = await authAxios.get(`${API_URL}/profile`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch profile');
  }
};

// Update user profile
export const updateProfile = async (profileData: {
  name?: string;
  organization?: string;
  phone?: string;
  location?: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<UserProfile> => {
  try {
    const response = await authAxios.put(`${API_URL}/profile`, profileData);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update profile');
  }
};

// Get user settings
export const getSettings = async (): Promise<UserSettings> => {
  try {
    const response = await authAxios.get(`${API_URL}/profile/settings`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch settings');
  }
};

// Update user settings
export const updateSettings = async (settingsData: {
  notifications?: {
    email?: boolean;
    browser?: boolean;
    mobile?: boolean;
  };
  twoFactorEnabled?: boolean;
}): Promise<UserSettings> => {
  try {
    const response = await authAxios.put(`${API_URL}/profile/settings`, settingsData);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update settings');
  }
};

import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface OrganizationDetails {
  name: string;
  /** Unique tenant shortname used in provisioned cloud resource tags. */
  shortName?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  logo?: string | null;
}

// Get organization details
export const getOrganization = async (): Promise<OrganizationDetails> => {
  try {
    const response = await authAxios.get(`${API_URL}/organization`);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to fetch organization details');
  }
};

// Update organization details
export const updateOrganization = async (data: Partial<OrganizationDetails>): Promise<OrganizationDetails> => {
  try {
    const response = await authAxios.put(`${API_URL}/organization`, data);
    return response.data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update organization details');
  }
};

import { BaseResource } from './base';
import { AxiosRequestConfig } from 'axios';

// Define interfaces for Profile data structures
interface UserProfile {
  id: string; // uuid
  name: string;
  email: string; // email format
  role: string;
  organization?: string | null;
  phone?: string | null;
  location?: string | null;
  joinDate: string; // ISO Date string
  bio?: string | null;
  avatarUrl?: string | null;
}

interface UpdateProfilePayload {
  name?: string;
  organization?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

interface UserSettings {
    id: string; // uuid (likely matches user or profile ID)
    notifications: {
        email: boolean;
        browser: boolean;
        mobile: boolean;
    };
    twoFactorEnabled: boolean;
}

interface UpdateSettingsPayload {
    notifications?: {
        email?: boolean;
        browser?: boolean;
        mobile?: boolean;
    };
    twoFactorEnabled?: boolean;
}


export class ProfileResource extends BaseResource {
  protected readonly RESOURCE_PATH = "profile";

  async get(config?: AxiosRequestConfig): Promise<UserProfile> {
    // Corresponds to GET /api/profile
    // Uses base path GET
    return this._list<UserProfile>(undefined, config);
  }

  async update(payload: UpdateProfilePayload, config?: AxiosRequestConfig): Promise<UserProfile> {
    // Corresponds to PUT /api/profile
    const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    // Uses base path PUT, call http client directly
    const path = this._getPath();
    return this.httpClient.put<UserProfile>(path, cleanedPayload, config);
  }

  async getSettings(config?: AxiosRequestConfig): Promise<UserSettings> {
    // Corresponds to GET /api/profile/settings
    const path = `${this.RESOURCE_PATH}/settings`;
    return this.httpClient.get<UserSettings>(path, config);
  }

  async updateSettings(payload: UpdateSettingsPayload, config?: AxiosRequestConfig): Promise<UserSettings> {
    // Corresponds to PUT /api/profile/settings
    const path = `${this.RESOURCE_PATH}/settings`;
     const cleanedPayload = Object.entries(payload)
        .filter(([_, value]) => value !== undefined) // Keep nulls if intended
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    return this.httpClient.put<UserSettings>(path, cleanedPayload, config);
  }
}

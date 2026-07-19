// Profile types and interfaces

// Profile update request
export interface ProfileUpdateRequestType {
  name?: string;
  organization?: string;
  phone?: string;
  location?: string;
  bio?: string;
  avatarUrl?: string;
}

// Profile response
export interface ProfileResponseType {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  phone: string | null;
  location: string | null;
  joinDate: Date;
  bio: string | null;
  avatarUrl: string;
}

// Settings update request
export interface SettingsUpdateRequestType {
  notifications?: {
    email?: boolean;
    browser?: boolean;
    mobile?: boolean;
  };
  /**
   * @deprecated Accepted for backward compatibility but IGNORED — 2FA state
   * only changes via the code-verified /api/auth/2fa/* endpoints.
   */
  twoFactorEnabled?: boolean;
}

// Settings response
export interface SettingsResponseType {
  id: string;
  notifications: {
    email: boolean;
    browser: boolean;
    mobile: boolean;
  };
  twoFactorEnabled: boolean;
}

// Swagger schemas
export const profileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string' },
    organization: { type: 'string' },
    phone: { type: 'string', nullable: true },
    location: { type: 'string', nullable: true },
    joinDate: { type: 'string', format: 'date-time' },
    bio: { type: 'string', nullable: true },
    avatarUrl: { type: 'string' }
  }
};

export const profileUpdateSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    organization: { type: 'string' },
    phone: { type: 'string' },
    location: { type: 'string' },
    bio: { type: 'string' },
    avatarUrl: { type: 'string' }
  }
};

export const settingsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    notifications: {
      type: 'object',
      properties: {
        email: { type: 'boolean' },
        browser: { type: 'boolean' },
        mobile: { type: 'boolean' }
      }
    },
    twoFactorEnabled: { type: 'boolean' }
  }
};

export const settingsUpdateSchema = {
  type: 'object',
  properties: {
    notifications: {
      type: 'object',
      properties: {
        email: { type: 'boolean' },
        browser: { type: 'boolean' },
        mobile: { type: 'boolean' }
      }
    },
    twoFactorEnabled: { type: 'boolean' }
  }
};

export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' }
  }
};

// Application configuration

// API URL - Set from environment variable or use default
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Authentication settings
export const AUTH_CONFIG = {
  tokenStorageKey: 'token',
  userStorageKey: 'user',
  refreshTokenStorageKey: 'refreshToken'
};

// Feature flags
export const FEATURES = {
  enableDarkMode: true,
  enableNotifications: true,
  enableAnalytics: false
};

// Default pagination settings
export const PAGINATION = {
  defaultPageSize: 10,
  pageSizeOptions: [5, 10, 25, 50, 100]
};

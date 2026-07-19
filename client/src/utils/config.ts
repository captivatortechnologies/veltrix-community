// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Default application settings
export const DEFAULT_SETTINGS = {
  pagination: {
    pageSize: 10,
    maxPages: 5
  },
  theme: {
    defaultMode: 'light'
  }
};

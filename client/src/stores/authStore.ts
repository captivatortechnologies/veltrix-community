/**
 * Authentication Store
 *
 * Manages user authentication state, tokens, and session.
 *
 * NOTE (Wave C, RBAC/IdP hardening 2026-07-10): this store's `login`/`logout`/
 * `validateToken` flow is disconnected from the app's real auth flow (see
 * `services/authService.ts` + `pages/access/LoginPage.tsx`, which use plain
 * axios + localStorage/sessionStorage, not this store) and this store's
 * `hasPermission`/`hasAnyPermission`/`hasAllPermissions` have no real data
 * source — `user.permissions` here is never populated by the real login
 * flow. The real permission source of truth is `hooks/usePermissions.ts`
 * (backed by `GET /api/me/permissions` + `stores/permissionStore.ts`); use
 * that instead of this store's permission methods.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  permissions: string[];
}

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Auth operations
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  validateToken: () => Promise<boolean>;
  
  // Permissions
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  
  // Reset
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,

        // Setters
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        setAccessToken: (token) => set({ accessToken: token }),
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),

        // Login
        login: async (email, password) => {
          set({ isLoading: true, error: null });

          try {
            const response = await fetch(`${API_URL}/auth/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include', // Include cookies
              body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Login failed');
            }

            const data = await response.json();

            set({
              user: data.user,
              accessToken: data.accessToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            set({
              error: message,
              isLoading: false,
              isAuthenticated: false,
            });
            throw error;
          }
        },

        // Logout
        logout: async () => {
          set({ isLoading: true });

          try {
            await fetch(`${API_URL}/auth/logout`, {
              method: 'POST',
              credentials: 'include',
            });
          } catch (error) {
            console.error('Logout error:', error);
          } finally {
            set({
              user: null,
              accessToken: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            });
          }
        },

        // Refresh access token
        refreshToken: async () => {
          try {
            const response = await fetch(`${API_URL}/auth/refresh`, {
              method: 'POST',
              credentials: 'include',
            });

            if (!response.ok) {
              throw new Error('Token refresh failed');
            }

            const data = await response.json();

            set({
              accessToken: data.accessToken,
              isAuthenticated: true,
            });

            return true;
          } catch (error) {
            console.error('Token refresh error:', error);
            
            // Clear auth state on refresh failure
            set({
              user: null,
              accessToken: null,
              isAuthenticated: false,
            });

            return false;
          }
        },

        // Validate current token
        validateToken: async () => {
          const { accessToken } = get();

          if (!accessToken) {
            return false;
          }

          try {
            const response = await fetch(`${API_URL}/auth/validate`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (!response.ok) {
              // Try to refresh token
              return get().refreshToken();
            }

            const data = await response.json();

            if (data.valid) {
              // Update user data if needed
              if (data.user && !get().user) {
                set({ user: data.user });
              }
              return true;
            }

            return false;
          } catch (error) {
            console.error('Token validation error:', error);
            return false;
          }
        },

        // Permission checks
        hasPermission: (permission) => {
          const { user } = get();
          return user?.permissions.includes(permission) || false;
        },

        hasAnyPermission: (permissions) => {
          const { user } = get();
          return permissions.some((p) => user?.permissions.includes(p)) || false;
        },

        hasAllPermissions: (permissions) => {
          const { user } = get();
          return permissions.every((p) => user?.permissions.includes(p)) || false;
        },

        hasRole: (role) => {
          const { user } = get();
          return user?.role === role || false;
        },

        // Reset state
        reset: () =>
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          }),
      }),
      {
        name: 'veltrix-auth',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          user: state.user,
          // Don't persist accessToken for security (it's in httpOnly cookie)
        }),
      }
    ),
    { name: 'AuthStore' }
  )
);

// Auto token refresh on store initialization
if (typeof window !== 'undefined') {
  const store = useAuthStore.getState();
  
  // Validate token on load
  if (store.user) {
    store.validateToken();
  }

  // Set up automatic token refresh (every 3.5 hours - token expires after 8 hours)
  setInterval(() => {
    if (store.isAuthenticated) {
      store.refreshToken();
    }
  }, 3.5 * 60 * 60 * 1000);
}

export default useAuthStore;

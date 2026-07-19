import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// ========================================================================
// Single API transport for the client.
//
// Every axios instance in the app is created through createApiInstance()
// so they all share:
//   - the auth request interceptor (Bearer token + X-Customer-ID header),
//   - the token-refresh response interceptor with request queueing
//     (module-level state, so concurrent 401s across ALL instances
//     coordinate on one refresh call).
//
// Consumers with extra needs layer their own interceptors on top
// (e.g. platformAdminApi's 403 -> /?error=access_denied redirect).
// ========================================================================

// Get token from localStorage or sessionStorage (based on rememberMe preference)
const getToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');

export const API_URL =
  import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim() !== ''
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:5000/api';

/** Default X-Customer-ID source: only what the login flow stored. */
const defaultGetCustomerId = (): string | null => localStorage.getItem('customerId');

export interface ApiInstanceOptions {
  /** Base URL for the instance. Defaults to the app API root. */
  baseURL?: string;
  /**
   * Source for the X-Customer-ID header. Instances that need a richer
   * fallback chain (e.g. authService's user-object/default-tenant fallback)
   * pass their own getter.
   */
  getCustomerId?: () => string | null;
}

// ---------------------------------------------------------------------------
// Shared token-refresh state — one refresh at a time across every instance.
// ---------------------------------------------------------------------------

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string | null) => void; reject: (error: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/** Clear stored auth and send the user to the login page. */
const logoutToLogin = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('customerId');
  sessionStorage.removeItem('token');
  window.location.href = '/login?expired=true';
};

/**
 * Attach the shared auth interceptors (request: token + customer header;
 * response: refresh-and-retry with queueing) to an axios instance.
 */
export function attachAuthInterceptors(
  instance: AxiosInstance,
  options: ApiInstanceOptions = {}
): AxiosInstance {
  const getCustomerId = options.getCustomerId ?? defaultGetCustomerId;

  instance.interceptors.request.use(
    (config) => {
      // Normalize a duplicated API prefix. Many services build request URLs as
      // `${API_URL}/resource` while this instance ALSO carries baseURL=API_URL.
      // In production API_URL is the RELATIVE '/api', so axios would combine
      // baseURL + url into '/api/api/resource' → 404. (In dev API_URL is an
      // absolute http URL, so service URLs are absolute and axios ignores the
      // baseURL — this branch is a no-op there.) When this instance's baseURL is
      // the app API root and the url starts with that same prefix, strip the
      // duplicate so the baseURL supplies it exactly once. Relative service URLs
      // (e.g. cognitoService's '/cognito') don't match and are left untouched.
      if (
        API_URL.startsWith('/') &&
        config.baseURL === API_URL &&
        typeof config.url === 'string' &&
        config.url.startsWith(`${API_URL}/`)
      ) {
        config.url = config.url.slice(API_URL.length);
      }

      const token = getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      const customerId = getCustomerId();
      if (customerId) {
        config.headers['X-Customer-ID'] = customerId;
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
        if (isRefreshing) {
          // A refresh is already in flight (possibly triggered by another
          // instance) — queue this request until it resolves.
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return instance(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Attempt to refresh the token
          // No request body (the refresh token travels in the cookie via
          // credentials: 'include'), so Content-Type must NOT be set — Fastify's
          // JSON parser rejects an empty body with 400 FST_ERR_CTP_EMPTY_JSON_BODY.
          const response = await fetch(`${API_URL.replace('/api', '')}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Token refresh failed');
          }

          const data = await response.json();
          const newToken = data.access_token || data.accessToken;

          if (newToken) {
            localStorage.setItem('token', newToken);
            processQueue(null, newToken);

            // Retry the original request with new token
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return instance(originalRequest);
          } else {
            throw new Error('No token in refresh response');
          }
        } catch (refreshError) {
          // Refresh failed, log user out
          processQueue(refreshError, null);
          logoutToLogin();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
}

/** Create an axios instance wired with the shared auth interceptors. */
export function createApiInstance(options: ApiInstanceOptions = {}): AxiosInstance {
  const instance = axios.create({
    baseURL: options.baseURL ?? API_URL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return attachAuthInterceptors(instance, options);
}

// The default app-wide instance.
const apiClient: AxiosInstance = createApiInstance();

// Generic API response type
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  success: boolean;
}

// API methods
export const api = {
  // GET request
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    return apiClient.get<T>(url, config);
  },

  // POST request
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    return apiClient.post<T>(url, data, config);
  },

  // PUT request
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    return apiClient.put<T>(url, data, config);
  },

  // DELETE request
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    return apiClient.delete<T>(url, config);
  },

  // PATCH request
  patch: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    return apiClient.patch<T>(url, data, config);
  },
};

export default apiClient;

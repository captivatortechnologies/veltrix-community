/**
 * Test Utilities for React Components
 * 
 * Helper functions and mocks for testing React components.
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Create a new QueryClient for tests
 */
export const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
};

/**
 * Render with all providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Mock deployment data
 */
export const createMockDeployment = (overrides: Record<string, unknown> = {}) => ({
  id: `deploy-${Date.now()}`,
  toolId: `tool-${Date.now()}`,
  toolName: 'Test Tool',
  vendor: 'test-vendor',
  status: 'pending',
  progress: 0,
  logs: [],
  startedAt: Date.now(),
  ...overrides,
});

/**
 * Mock tool data
 */
export const createMockTool = (overrides: Record<string, unknown> = {}) => ({
  id: `tool-${Date.now()}`,
  name: 'Test Tool',
  vendor: 'test-vendor',
  category: 'monitoring',
  status: 'active',
  ...overrides,
});

/**
 * Mock user data
 */
export const createMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: `user-${Date.now()}`,
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  tenantId: `tenant-${Date.now()}`,
  ...overrides,
});

/**
 * Mock activity data
 */
export const createMockActivity = (overrides: Record<string, unknown> = {}) => ({
  id: `activity-${Date.now()}`,
  type: 'deployment_started',
  userId: `user-${Date.now()}`,
  userName: 'Test User',
  tenantId: `tenant-${Date.now()}`,
  message: 'Test activity',
  timestamp: Date.now(),
  read: false,
  ...overrides,
});

/**
 * Mock notification data
 */
export const createMockNotification = (overrides: Record<string, unknown> = {}) => ({
  id: `notification-${Date.now()}`,
  type: 'info',
  priority: 'medium',
  title: 'Test Notification',
  message: 'This is a test notification',
  read: false,
  createdAt: Date.now(),
  ...overrides,
});

/**
 * Mock presence data
 */
export const createMockPresence = (overrides: Record<string, unknown> = {}) => ({
  userId: `user-${Date.now()}`,
  userName: 'Test User',
  status: 'online',
  lastSeen: Date.now(),
  tenantId: `tenant-${Date.now()}`,
  ...overrides,
});

/**
 * Wait for a specified time
 */
export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mock socket.io client
 */
export const createMockSocket = () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler?: (...args: unknown[]) => void) => {
      if (!handler) {
        listeners.delete(event);
      } else {
        const handlers = listeners.get(event);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      }
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event);
      if (handlers) {
        handlers.forEach((handler) => handler(...args));
      }
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
    // Helper to trigger events in tests
    trigger: (event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event);
      if (handlers) {
        handlers.forEach((handler) => handler(...args));
      }
    },
    listeners,
  };
};

// Re-export testing library utilities
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

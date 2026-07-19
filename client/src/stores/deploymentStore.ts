/**
 * Deployment Store
 * 
 * Manages deployment state with real-time WebSocket updates.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import { setupWebSocketListeners, cleanupWebSocketListeners } from './websocket-integration';

export enum DeploymentStatus {
  QUEUED = 'queued',
  BUILDING = 'building',
  DEPLOYING = 'deploying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Deployment {
  id: string;
  tenantId: string;
  userId: string;
  status: DeploymentStatus;
  progress: number;
  message?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface DeploymentLog {
  deploymentId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
}

interface DeploymentState {
  // State
  deployments: Record<string, Deployment>;
  logs: Record<string, DeploymentLog[]>;
  isConnected: boolean;
  socket: Socket | null;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Optimistic updates
  optimisticDeployments: Record<string, Deployment>;
  
  // Actions
  setDeployments: (deployments: Deployment[]) => void;
  addDeployment: (deployment: Deployment) => void;
  updateDeployment: (id: string, updates: Partial<Deployment>) => void;
  removeDeployment: (id: string) => void;
  
  // Logs
  addLog: (log: DeploymentLog) => void;
  clearLogs: (deploymentId: string) => void;
  
  // Optimistic updates
  addOptimisticDeployment: (deployment: Deployment) => void;
  removeOptimisticDeployment: (id: string) => void;
  
  // WebSocket
  connect: (accessToken: string) => void;
  disconnect: () => void;
  
  // API actions
  startDeployment: (config: unknown) => Promise<Deployment>;
  cancelDeployment: (id: string) => Promise<void>;
  fetchDeployments: (tenantId?: string) => Promise<void>;
  
  // Utilities
  getDeployment: (id: string) => Deployment | undefined;
  getDeploymentsByStatus: (status: DeploymentStatus) => Deployment[];
  getActiveDeployments: () => Deployment[];
  
  // Reset
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export const useDeploymentStore = create<DeploymentState>()(
  devtools(
    (set, get) => ({
      // Initial state
      deployments: {},
      logs: {},
      isConnected: false,
      socket: null,
      isLoading: false,
      error: null,
      optimisticDeployments: {},

      // Set multiple deployments
      setDeployments: (deployments) => {
        const deploymentsMap = deployments.reduce(
          (acc, d) => ({ ...acc, [d.id]: d }),
          {}
        );
        set({ deployments: deploymentsMap });
      },

      // Add single deployment
      addDeployment: (deployment) =>
        set((state) => ({
          deployments: {
            ...state.deployments,
            [deployment.id]: deployment,
          },
        })),

      // Update deployment
      updateDeployment: (id, updates) =>
        set((state) => ({
          deployments: {
            ...state.deployments,
            [id]: {
              ...state.deployments[id],
              ...updates,
              updatedAt: Date.now(),
            },
          },
        })),

      // Remove deployment
      removeDeployment: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.deployments;
          return { deployments: rest };
        }),

      // Add log entry
      addLog: (log) =>
        set((state) => ({
          logs: {
            ...state.logs,
            [log.deploymentId]: [
              ...(state.logs[log.deploymentId] || []),
              log,
            ],
          },
        })),

      // Clear logs for deployment
      clearLogs: (deploymentId) =>
        set((state) => {
          const { [deploymentId]: _, ...rest } = state.logs;
          return { logs: rest };
        }),

      // Optimistic updates
      addOptimisticDeployment: (deployment) =>
        set((state) => ({
          optimisticDeployments: {
            ...state.optimisticDeployments,
            [deployment.id]: deployment,
          },
        })),

      removeOptimisticDeployment: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.optimisticDeployments;
          return { optimisticDeployments: rest };
        }),

      // WebSocket connection
      connect: (accessToken) => {
        const { socket } = get();

        // Disconnect existing connection
        if (socket) {
          socket.disconnect();
        }

        const newSocket = io(WS_URL, {
          auth: {
            token: accessToken,
          },
          transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => {
          console.log('WebSocket connected');
          set({ isConnected: true });
        });

        newSocket.on('disconnect', () => {
          console.log('WebSocket disconnected');
          set({ isConnected: false });
        });

        newSocket.on('error', (error) => {
          console.error('WebSocket error:', error);
          set({ error: error.message });
        });

        // Deployment events
        newSocket.on('deployment:status', (data) => {
          const { updateDeployment, removeOptimisticDeployment } = get();
          updateDeployment(data.deploymentId, {
            status: data.status,
            progress: data.progress,
            message: data.message,
            updatedAt: data.timestamp,
          });
          removeOptimisticDeployment(data.deploymentId);
        });

        newSocket.on('deployment:progress', (data) => {
          const { updateDeployment } = get();
          updateDeployment(data.deploymentId, {
            progress: data.progress,
            message: data.message,
            updatedAt: data.timestamp,
          });
        });

        newSocket.on('deployment:log', (data) => {
          const { addLog } = get();
          addLog(data);
        });

        newSocket.on('deployment:completed', (data) => {
          const { updateDeployment } = get();
          updateDeployment(data.deploymentId, {
            status: DeploymentStatus.COMPLETED,
            progress: 100,
            message: data.message,
            updatedAt: data.timestamp,
          });
        });

        newSocket.on('deployment:failed', (data) => {
          const { updateDeployment } = get();
          updateDeployment(data.deploymentId, {
            status: DeploymentStatus.FAILED,
            message: data.reason,
            updatedAt: data.timestamp,
          });
        });

        // Setup integrated WebSocket listeners for all stores
        setupWebSocketListeners(newSocket);

        set({ socket: newSocket });
      },

      // Disconnect WebSocket
      disconnect: () => {
        const { socket } = get();
        if (socket) {
          // Cleanup integrated listeners
          cleanupWebSocketListeners(socket);
          socket.disconnect();
          set({ socket: null, isConnected: false });
        }
      },

      // Start deployment with optimistic update
      startDeployment: async (config) => {
        set({ isLoading: true, error: null });

        // Create optimistic deployment
        const optimisticDeployment: Deployment = {
          id: `temp-${Date.now()}`,
          tenantId: '', // Will be filled by backend
          userId: '',
          status: DeploymentStatus.QUEUED,
          progress: 0,
          message: 'Initializing deployment...',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        get().addOptimisticDeployment(optimisticDeployment);

        try {
          const response = await fetch(`${API_URL}/deployments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(config),
          });

          if (!response.ok) {
            throw new Error('Failed to start deployment');
          }

          const deployment = await response.json();

          get().removeOptimisticDeployment(optimisticDeployment.id);
          get().addDeployment(deployment);
          set({ isLoading: false });

          return deployment;
        } catch (error) {
          get().removeOptimisticDeployment(optimisticDeployment.id);
          const message = error instanceof Error ? error.message : 'Failed to start deployment';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Cancel deployment
      cancelDeployment: async (id) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/deployments/${id}/cancel`, {
            method: 'POST',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to cancel deployment');
          }

          get().updateDeployment(id, {
            status: DeploymentStatus.CANCELLED,
          });

          set({ isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to cancel deployment';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Fetch deployments
      fetchDeployments: async (tenantId) => {
        set({ isLoading: true, error: null });

        try {
          const url = tenantId
            ? `${API_URL}/deployments?tenantId=${tenantId}`
            : `${API_URL}/deployments`;

          const response = await fetch(url, {
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to fetch deployments');
          }

          const deployments = await response.json();
          get().setDeployments(deployments);
          set({ isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch deployments';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Get single deployment
      getDeployment: (id) => {
        const { deployments, optimisticDeployments } = get();
        return deployments[id] || optimisticDeployments[id];
      },

      // Get deployments by status
      getDeploymentsByStatus: (status) => {
        const { deployments } = get();
        return Object.values(deployments).filter((d) => d.status === status);
      },

      // Get active deployments (not completed/failed/cancelled)
      getActiveDeployments: () => {
        const { deployments } = get();
        return Object.values(deployments).filter(
          (d) =>
            d.status !== DeploymentStatus.COMPLETED &&
            d.status !== DeploymentStatus.FAILED &&
            d.status !== DeploymentStatus.CANCELLED
        );
      },

      // Reset
      reset: () =>
        set({
          deployments: {},
          logs: {},
          optimisticDeployments: {},
          isLoading: false,
          error: null,
        }),
    }),
    { name: 'DeploymentStore' }
  )
);

export default useDeploymentStore;

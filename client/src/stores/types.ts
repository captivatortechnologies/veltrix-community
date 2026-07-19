/**
 * Zustand Store Types
 * 
 * Shared type definitions for all stores.
 */

import type { StateCreator } from 'zustand';

/**
 * Base store slice with common properties
 */
export interface BaseSlice {
  isLoading: boolean;
  error: string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Store with optimistic updates
 */
export interface OptimisticStore<T> {
  optimisticUpdates: Map<string, T>;
  addOptimisticUpdate: (id: string, data: T) => void;
  removeOptimisticUpdate: (id: string) => void;
  clearOptimisticUpdates: () => void;
}

/**
 * Store with persistence
 */
export interface PersistentStore {
  _hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
}

/**
 * Middleware options for stores
 */
export interface StoreOptions {
  persist?: boolean;
  devtools?: boolean;
  name?: string;
}

/**
 * Helper type for creating store slices
 */
export type StoreSlice<T> = StateCreator<T, [], [], T>;

/**
 * API response types
 */
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * WebSocket event types
 */
export interface WebSocketEvent<T = unknown> {
  event: string;
  data: T;
  timestamp: number;
}

export interface ConnectionStatus {
  connected: boolean;
  reconnecting: boolean;
  lastConnected?: number;
  error?: string;
}

/**
 * Common action types
 */
export type AsyncAction<T, R = void> = (data: T) => Promise<R>;
export type SyncAction<T, R = void> = (data: T) => R;

/**
 * Store hydration status
 */
export interface HydrationState {
  hydrated: boolean;
  rehydrating: boolean;
}

export default {};

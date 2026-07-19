/**
 * Presence Store
 * 
 * Manages user presence tracking with WebSocket integration.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  BUSY = 'busy',
  OFFLINE = 'offline',
}

export interface UserPresence {
  userId: string;
  userName: string;
  userAvatar?: string;
  status: PresenceStatus;
  lastSeen: number;
  tenantId: string;
  metadata?: Record<string, unknown>;
}

export interface PresenceState {
  // State
  presence: Map<string, UserPresence>;
  myStatus: PresenceStatus;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setPresence: (userId: string, presence: UserPresence) => void;
  setMultiplePresence: (presences: UserPresence[]) => void;
  removePresence: (userId: string) => void;
  updateMyStatus: (status: PresenceStatus) => void;
  clearPresence: () => void;
  
  // API
  fetchPresence: (tenantId: string) => Promise<void>;
  requestPresence: (userIds: string[]) => void;
  
  // Getters
  getPresence: (userId: string) => UserPresence | undefined;
  getOnlineUsers: () => UserPresence[];
  getUsersByStatus: (status: PresenceStatus) => UserPresence[];
  getTenantPresence: (tenantId: string) => UserPresence[];
  isUserOnline: (userId: string) => boolean;
  
  // Reset
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const AWAY_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity = away

export const usePresenceStore = create<PresenceState>()(
  devtools(
    (set, get) => ({
      // Initial state
      presence: new Map(),
      myStatus: PresenceStatus.ONLINE,
      isLoading: false,
      error: null,

      // Set single presence
      setPresence: (userId, presence) =>
        set((state) => {
          const newPresence = new Map(state.presence);
          newPresence.set(userId, presence);
          return { presence: newPresence };
        }),

      // Set multiple presences
      setMultiplePresence: (presences) =>
        set((state) => {
          const newPresence = new Map(state.presence);
          presences.forEach((p) => {
            newPresence.set(p.userId, p);
          });
          return { presence: newPresence };
        }),

      // Remove presence
      removePresence: (userId) =>
        set((state) => {
          const newPresence = new Map(state.presence);
          newPresence.delete(userId);
          return { presence: newPresence };
        }),

      // Update my status
      updateMyStatus: (status) => {
        set({ myStatus: status });

        // Emit status change to WebSocket
        // This will be handled by the WebSocket integration in the main app
      },

      // Clear all presence
      clearPresence: () =>
        set({
          presence: new Map(),
        }),

      // Fetch presence from API
      fetchPresence: async (tenantId) => {
        set({ isLoading: true, error: null });

        try {
          const response = await fetch(`${API_URL}/presence?tenantId=${tenantId}`, {
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to fetch presence');
          }

          const data: UserPresence[] = await response.json();
          get().setMultiplePresence(data);
          set({ isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch presence';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Request presence for specific users
      requestPresence: () => {
        // This will be handled by the WebSocket integration
        // Emits 'presence:request' event with userIds
      },

      // Get single user presence
      getPresence: (userId) => {
        const { presence } = get();
        return presence.get(userId);
      },

      // Get online users
      getOnlineUsers: () => {
        const { presence } = get();
        return Array.from(presence.values()).filter((p) => p.status === PresenceStatus.ONLINE);
      },

      // Get users by status
      getUsersByStatus: (status) => {
        const { presence } = get();
        return Array.from(presence.values()).filter((p) => p.status === status);
      },

      // Get tenant presence
      getTenantPresence: (tenantId) => {
        const { presence } = get();
        return Array.from(presence.values()).filter((p) => p.tenantId === tenantId);
      },

      // Check if user is online
      isUserOnline: (userId) => {
        const { presence } = get();
        const userPresence = presence.get(userId);
        return userPresence?.status === PresenceStatus.ONLINE;
      },

      // Reset
      reset: () =>
        set({
          presence: new Map(),
          myStatus: PresenceStatus.ONLINE,
          isLoading: false,
          error: null,
        }),
    }),
    { name: 'PresenceStore' }
  )
);

// Auto-detect inactivity and set status to away
let inactivityTimer: NodeJS.Timeout;

const resetActivityTimer = () => {
  
  // Clear existing timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  // Set new timer
  inactivityTimer = setTimeout(() => {
    const store = usePresenceStore.getState();
    if (store.myStatus === PresenceStatus.ONLINE) {
      store.updateMyStatus(PresenceStatus.AWAY);
    }
  }, AWAY_TIMEOUT);
};

// Listen to user activity
if (typeof window !== 'undefined') {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  
  events.forEach((event) => {
    document.addEventListener(event, () => {
      const store = usePresenceStore.getState();
      
      // If user was away, bring them back online
      if (store.myStatus === PresenceStatus.AWAY) {
        store.updateMyStatus(PresenceStatus.ONLINE);
      }
      
      resetActivityTimer();
    }, true);
  });
  
  // Start initial timer
  resetActivityTimer();
}

export default usePresenceStore;

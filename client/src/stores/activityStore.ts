/**
 * Activity Store
 * 
 * Manages activity feed with real-time updates.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export enum ActivityType {
  DEPLOYMENT_STARTED = 'deployment_started',
  DEPLOYMENT_COMPLETED = 'deployment_completed',
  DEPLOYMENT_FAILED = 'deployment_failed',
  TOOL_ADDED = 'tool_added',
  TOOL_REMOVED = 'tool_removed',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
  CONFIG_UPDATED = 'config_updated',
  ALERT_TRIGGERED = 'alert_triggered',
}

export interface Activity {
  id: string;
  type: ActivityType;
  userId: string;
  userName: string;
  tenantId: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  read: boolean;
}

interface ActivityState {
  // State
  activities: Activity[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  
  // Filters
  filterType: ActivityType | 'all';
  showUnreadOnly: boolean;
  
  // Actions
  addActivity: (activity: Activity) => void;
  setActivities: (activities: Activity[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeActivity: (id: string) => void;
  clearActivities: () => void;
  
  // Filters
  setFilterType: (type: ActivityType | 'all') => void;
  setShowUnreadOnly: (show: boolean) => void;
  
  // API
  fetchActivities: (tenantId?: string) => Promise<void>;
  
  // Getters
  getFilteredActivities: () => Activity[];
  getRecentActivities: (count: number) => Activity[];
  
  // Reset
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MAX_ACTIVITIES = 100; // Keep last 100 activities in memory

export const useActivityStore = create<ActivityState>()(
  devtools(
    (set, get) => ({
      // Initial state
      activities: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      filterType: 'all',
      showUnreadOnly: false,

      // Add single activity
      addActivity: (activity) =>
        set((state) => {
          const activities = [activity, ...state.activities].slice(0, MAX_ACTIVITIES);
          const unreadCount = activities.filter((a) => !a.read).length;
          
          return {
            activities,
            unreadCount,
          };
        }),

      // Set all activities
      setActivities: (activities) => {
        const unreadCount = activities.filter((a) => !a.read).length;
        set({ activities, unreadCount });
      },

      // Mark single activity as read
      markAsRead: (id) =>
        set((state) => {
          const activities = state.activities.map((a) =>
            a.id === id ? { ...a, read: true } : a
          );
          const unreadCount = activities.filter((a) => !a.read).length;
          
          return {
            activities,
            unreadCount,
          };
        }),

      // Mark all as read
      markAllAsRead: () =>
        set((state) => ({
          activities: state.activities.map((a) => ({ ...a, read: true })),
          unreadCount: 0,
        })),

      // Remove activity
      removeActivity: (id) =>
        set((state) => {
          const activities = state.activities.filter((a) => a.id !== id);
          const unreadCount = activities.filter((a) => !a.read).length;
          
          return {
            activities,
            unreadCount,
          };
        }),

      // Clear all activities
      clearActivities: () =>
        set({
          activities: [],
          unreadCount: 0,
        }),

      // Set filter type
      setFilterType: (type) => set({ filterType: type }),

      // Set show unread only
      setShowUnreadOnly: (show) => set({ showUnreadOnly: show }),

      // Fetch activities from API
      fetchActivities: async (tenantId) => {
        set({ isLoading: true, error: null });

        try {
          const url = tenantId
            ? `${API_URL}/activities?tenantId=${tenantId}`
            : `${API_URL}/activities`;

          const response = await fetch(url, {
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to fetch activities');
          }

          const data = await response.json();
          get().setActivities(data);
          set({ isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch activities';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      // Get filtered activities
      getFilteredActivities: () => {
        const { activities, filterType, showUnreadOnly } = get();

        let filtered = activities;

        if (filterType !== 'all') {
          filtered = filtered.filter((a) => a.type === filterType);
        }

        if (showUnreadOnly) {
          filtered = filtered.filter((a) => !a.read);
        }

        return filtered;
      },

      // Get recent activities
      getRecentActivities: (count) => {
        const { activities } = get();
        return activities.slice(0, count);
      },

      // Reset
      reset: () =>
        set({
          activities: [],
          unreadCount: 0,
          isLoading: false,
          error: null,
          filterType: 'all',
          showUnreadOnly: false,
        }),
    }),
    { name: 'ActivityStore' }
  )
);

// Helper function to create activity from deployment event
export const createDeploymentActivity = (
  deploymentEvent: { deploymentId: string; status: string; userId: string; userName: string; tenantId: string }
): Activity => {
  const { deploymentId, status, userId, userName, tenantId } = deploymentEvent;

  let type: ActivityType;
  let message: string;

  switch (status) {
    case 'completed':
      type = ActivityType.DEPLOYMENT_COMPLETED;
      message = `${userName} completed deployment ${deploymentId}`;
      break;
    case 'failed':
      type = ActivityType.DEPLOYMENT_FAILED;
      message = `${userName}'s deployment ${deploymentId} failed`;
      break;
    default:
      type = ActivityType.DEPLOYMENT_STARTED;
      message = `${userName} started deployment ${deploymentId}`;
  }

  return {
    id: `activity-${Date.now()}-${Math.random()}`,
    type,
    userId,
    userName,
    tenantId,
    message,
    metadata: { deploymentId, status },
    timestamp: Date.now(),
    read: false,
  };
};

export default useActivityStore;

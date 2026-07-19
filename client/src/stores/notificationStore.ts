/**
 * Notification Store
 * 
 * Manages notifications with real-time WebSocket updates and toast notifications.
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  userId: string;
  tenantId: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  dismissed: boolean;
  createdAt: number;
  expiresAt?: number;
  actionUrl?: string;
  actionLabel?: string;
}

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // milliseconds, default 5000
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationState {
  // State
  notifications: Notification[];
  toasts: ToastNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  
  // Settings
  soundEnabled: boolean;
  desktopEnabled: boolean;
  
  // Filters
  filterType: NotificationType | 'all';
  filterPriority: NotificationPriority | 'all';
  showUnreadOnly: boolean;
  
  // Actions
  addNotification: (notification: Notification) => void;
  setNotifications: (notifications: Notification[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  removeExpired: () => void;
  
  // Toast actions
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  hideToast: (id: string) => void;
  clearToasts: () => void;
  
  // Settings
  setSoundEnabled: (enabled: boolean) => void;
  setDesktopEnabled: (enabled: boolean) => void;
  
  // Filters
  setFilterType: (type: NotificationType | 'all') => void;
  setFilterPriority: (priority: NotificationPriority | 'all') => void;
  setShowUnreadOnly: (show: boolean) => void;
  
  // API
  fetchNotifications: (userId?: string) => Promise<void>;
  
  // Getters
  getFilteredNotifications: () => Notification[];
  getNotificationsByPriority: (priority: NotificationPriority) => Notification[];
  getUnreadNotifications: () => Notification[];
  
  // Reset
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MAX_NOTIFICATIONS = 200; // Keep last 200 notifications
const MAX_TOASTS = 5; // Show max 5 toasts at once
const DEFAULT_TOAST_DURATION = 5000; // 5 seconds

// Sound notification
const playNotificationSound = () => {
  const audio = new Audio('/sounds/notification.mp3');
  audio.volume = 0.5;
  audio.play().catch(() => {
    // Ignore errors if sound fails to play
  });
};

// Desktop notification
const showDesktopNotification = (notification: Notification) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(notification.title, {
      body: notification.message,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: notification.id,
    });
  }
};

// Request desktop notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const useNotificationStore = create<NotificationState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        notifications: [],
        toasts: [],
        unreadCount: 0,
        isLoading: false,
        error: null,
        soundEnabled: true,
        desktopEnabled: false,
        filterType: 'all',
        filterPriority: 'all',
        showUnreadOnly: false,

        // Add notification
        addNotification: (notification) => {
          set((state) => {
            // Check if notification already exists
            if (state.notifications.some((n) => n.id === notification.id)) {
              return state;
            }

            const notifications = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
            const unreadCount = notifications.filter((n) => !n.read).length;

            // Play sound if enabled
            if (state.soundEnabled && !notification.read) {
              playNotificationSound();
            }

            // Show desktop notification if enabled
            if (state.desktopEnabled && !notification.read) {
              showDesktopNotification(notification);
            }

            // Show toast for high priority notifications
            if (notification.priority === NotificationPriority.HIGH || notification.priority === NotificationPriority.CRITICAL) {
              get().showToast({
                type: notification.type,
                title: notification.title,
                message: notification.message,
                duration: notification.priority === NotificationPriority.CRITICAL ? 10000 : 5000,
                action: notification.actionUrl ? {
                  label: notification.actionLabel || 'View',
                  onClick: () => {
                    window.location.href = notification.actionUrl!;
                  },
                } : undefined,
              });
            }

            return {
              notifications,
              unreadCount,
            };
          });
        },

        // Set all notifications
        setNotifications: (notifications) => {
          const unreadCount = notifications.filter((n) => !n.read).length;
          set({ notifications, unreadCount });
        },

        // Mark as read
        markAsRead: (id) =>
          set((state) => {
            const notifications = state.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            );
            const unreadCount = notifications.filter((n) => !n.read).length;

            return {
              notifications,
              unreadCount,
            };
          }),

        // Mark all as read
        markAllAsRead: () =>
          set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          })),

        // Dismiss notification
        dismissNotification: (id) =>
          set((state) => {
            const notifications = state.notifications.map((n) =>
              n.id === id ? { ...n, dismissed: true } : n
            );
            const unreadCount = notifications.filter((n) => !n.read).length;

            return {
              notifications,
              unreadCount,
            };
          }),

        // Clear all notifications
        clearNotifications: () =>
          set({
            notifications: [],
            unreadCount: 0,
          }),

        // Remove expired notifications
        removeExpired: () =>
          set((state) => {
            const now = Date.now();
            const notifications = state.notifications.filter(
              (n) => !n.expiresAt || n.expiresAt > now
            );
            const unreadCount = notifications.filter((n) => !n.read).length;

            return {
              notifications,
              unreadCount,
            };
          }),

        // Show toast
        showToast: (toast) => {
          const id = `toast-${Date.now()}-${Math.random()}`;
          const newToast: ToastNotification = {
            ...toast,
            id,
            duration: toast.duration || DEFAULT_TOAST_DURATION,
          };

          set((state) => {
            const toasts = [...state.toasts, newToast].slice(-MAX_TOASTS);
            return { toasts };
          });

          // Auto-hide toast after duration
          setTimeout(() => {
            get().hideToast(id);
          }, newToast.duration);
        },

        // Hide toast
        hideToast: (id) =>
          set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          })),

        // Clear all toasts
        clearToasts: () => set({ toasts: [] }),

        // Set sound enabled
        setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

        // Set desktop enabled
        setDesktopEnabled: async (enabled) => {
          if (enabled) {
            const granted = await requestNotificationPermission();
            if (granted) {
              set({ desktopEnabled: true });
            }
          } else {
            set({ desktopEnabled: false });
          }
        },

        // Set filter type
        setFilterType: (type) => set({ filterType: type }),

        // Set filter priority
        setFilterPriority: (priority) => set({ filterPriority: priority }),

        // Set show unread only
        setShowUnreadOnly: (show) => set({ showUnreadOnly: show }),

        // Fetch notifications
        fetchNotifications: async (userId) => {
          set({ isLoading: true, error: null });

          try {
            const url = userId
              ? `${API_URL}/notifications?userId=${userId}`
              : `${API_URL}/notifications`;

            const response = await fetch(url, {
              credentials: 'include',
            });

            if (!response.ok) {
              throw new Error('Failed to fetch notifications');
            }

            const data = await response.json();
            get().setNotifications(data);
            set({ isLoading: false });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch notifications';
            set({ error: message, isLoading: false });
            throw error;
          }
        },

        // Get filtered notifications
        getFilteredNotifications: () => {
          const { notifications, filterType, filterPriority, showUnreadOnly } = get();

          let filtered = notifications.filter((n) => !n.dismissed);

          if (filterType !== 'all') {
            filtered = filtered.filter((n) => n.type === filterType);
          }

          if (filterPriority !== 'all') {
            filtered = filtered.filter((n) => n.priority === filterPriority);
          }

          if (showUnreadOnly) {
            filtered = filtered.filter((n) => !n.read);
          }

          return filtered;
        },

        // Get notifications by priority
        getNotificationsByPriority: (priority) => {
          const { notifications } = get();
          return notifications.filter((n) => n.priority === priority && !n.dismissed);
        },

        // Get unread notifications
        getUnreadNotifications: () => {
          const { notifications } = get();
          return notifications.filter((n) => !n.read && !n.dismissed);
        },

        // Reset
        reset: () =>
          set({
            notifications: [],
            toasts: [],
            unreadCount: 0,
            isLoading: false,
            error: null,
            filterType: 'all',
            filterPriority: 'all',
            showUnreadOnly: false,
          }),
      }),
      {
        name: 'veltrix-notifications',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // Only persist notifications and settings
          notifications: state.notifications,
          soundEnabled: state.soundEnabled,
          desktopEnabled: state.desktopEnabled,
        }),
      }
    ),
    { name: 'NotificationStore' }
  )
);

// Cleanup expired notifications every 5 minutes
setInterval(() => {
  useNotificationStore.getState().removeExpired();
}, 5 * 60 * 1000);

export default useNotificationStore;

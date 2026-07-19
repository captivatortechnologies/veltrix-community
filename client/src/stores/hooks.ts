/**
 * Store Hooks
 * 
 * Custom hooks for accessing stores with selectors.
 */

import { useAuthStore } from './authStore';
import { useDeploymentStore } from './deploymentStore';
import { usePreferencesStore } from './preferencesStore';
import { useActivityStore } from './activityStore';
import { useNotificationStore } from './notificationStore';
import { usePresenceStore } from './presenceStore';
import { usePermissions as usePermissionsImpl } from '../hooks/usePermissions';

/**
 * Authentication hooks
 */
export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
};

/**
 * Permission hooks (C1, Wave C RBAC/IdP hardening 2026-07-10).
 *
 * Re-exports `hooks/usePermissions.ts` — the real implementation, backed by
 * `GET /api/me/permissions` (react-query) and `stores/permissionStore.ts`
 * (the server-mirrored matching logic + the synchronous store the SDK host
 * runtime reads). Kept re-exported from here so the public `stores` barrel
 * API (`import { usePermissions } from '../../stores'`) stays stable —
 * `authStore.hasPermission`/`hasAnyPermission`/`hasAllPermissions` had no
 * real data source and are superseded by this.
 */
export const usePermissions = usePermissionsImpl;

/**
 * Deployment hooks
 */
export const useDeployments = () => {
  const deployments = useDeploymentStore((state) => state.deployments);
  const optimisticDeployments = useDeploymentStore((state) => state.optimisticDeployments);
  const isLoading = useDeploymentStore((state) => state.isLoading);
  const isConnected = useDeploymentStore((state) => state.isConnected);

  // Merge real and optimistic deployments
  const allDeployments = {
    ...deployments,
    ...optimisticDeployments,
  };

  return {
    deployments: Object.values(allDeployments),
    isLoading,
    isConnected,
  };
};

export const useDeployment = (id: string) => {
  const getDeployment = useDeploymentStore((state) => state.getDeployment);
  return getDeployment(id);
};

export const useDeploymentLogs = (deploymentId: string) => {
  const logs = useDeploymentStore((state) => state.logs[deploymentId] || []);
  return logs;
};

export const useActiveDeployments = () => {
  const getActiveDeployments = useDeploymentStore((state) => state.getActiveDeployments);
  return getActiveDeployments();
};

/**
 * Preferences hooks
 */
export const useTheme = () => {
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  return {
    theme,
    setTheme,
  };
};

export const useSidebar = () => {
  const sidebarState = usePreferencesStore((state) => state.sidebarState);
  const setSidebarState = usePreferencesStore((state) => state.setSidebarState);
  const toggleSidebar = usePreferencesStore((state) => state.toggleSidebar);

  return {
    sidebarState,
    isExpanded: sidebarState === 'expanded',
    isCollapsed: sidebarState === 'collapsed',
    isHidden: sidebarState === 'hidden',
    setSidebarState,
    toggleSidebar,
  };
};

export const useTablePreferences = (tableId: string) => {
  const getTablePreferences = usePreferencesStore((state) => state.getTablePreferences);
  const setTablePreferences = usePreferencesStore((state) => state.setTablePreferences);
  const resetTablePreferences = usePreferencesStore((state) => state.resetTablePreferences);

  const preferences = getTablePreferences(tableId);

  return {
    preferences,
    setPreferences: (prefs: Parameters<typeof setTablePreferences>[1]) =>
      setTablePreferences(tableId, prefs),
    resetPreferences: () => resetTablePreferences(tableId),
  };
};

export const useNotificationPreferences = () => {
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  const soundEnabled = usePreferencesStore((state) => state.soundEnabled);
  const setNotificationsEnabled = usePreferencesStore((state) => state.setNotificationsEnabled);
  const setSoundEnabled = usePreferencesStore((state) => state.setSoundEnabled);

  return {
    notificationsEnabled,
    soundEnabled,
    setNotificationsEnabled,
    setSoundEnabled,
  };
};

export const useRecentItems = () => {
  const recentDeployments = usePreferencesStore((state) => state.recentDeployments);
  const recentTools = usePreferencesStore((state) => state.recentTools);
  const addRecentDeployment = usePreferencesStore((state) => state.addRecentDeployment);
  const addRecentTool = usePreferencesStore((state) => state.addRecentTool);

  return {
    recentDeployments,
    recentTools,
    addRecentDeployment,
    addRecentTool,
  };
};

/**
 * Combined hooks for common patterns
 */
export const useAuthenticatedUser = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { hasPermission } = usePermissions();
  // hasRole has no equivalent in the new RBAC permission model (role NAMES
  // are no longer the source of truth — see usePermissions above); kept
  // sourced from authStore for any legacy caller that still wants a role-name
  // comparison against authStore's own (separately dead) user record.
  const hasRole = useAuthStore((state) => state.hasRole);

  return {
    user,
    isAuthenticated,
    isLoading,
    hasPermission,
    hasRole,
  };
};

export const useDeploymentActions = () => {
  const startDeployment = useDeploymentStore((state) => state.startDeployment);
  const cancelDeployment = useDeploymentStore((state) => state.cancelDeployment);
  const fetchDeployments = useDeploymentStore((state) => state.fetchDeployments);

  return {
    startDeployment,
    cancelDeployment,
    fetchDeployments,
  };
};

export const useWebSocketConnection = () => {
  const connect = useDeploymentStore((state) => state.connect);
  const disconnect = useDeploymentStore((state) => state.disconnect);
  const isConnected = useDeploymentStore((state) => state.isConnected);

  return {
    connect,
    disconnect,
    isConnected,
  };
};

/**
 * Activity hooks
 */
export const useActivities = () => {
  const activities = useActivityStore((state) => state.getFilteredActivities());
  const unreadCount = useActivityStore((state) => state.unreadCount);
  const isLoading = useActivityStore((state) => state.isLoading);

  return {
    activities,
    unreadCount,
    isLoading,
  };
};

export const useRecentActivities = (count: number = 10) => {
  const getRecentActivities = useActivityStore((state) => state.getRecentActivities);
  return getRecentActivities(count);
};

export const useActivityActions = () => {
  const markAsRead = useActivityStore((state) => state.markAsRead);
  const markAllAsRead = useActivityStore((state) => state.markAllAsRead);
  const clearActivities = useActivityStore((state) => state.clearActivities);
  const fetchActivities = useActivityStore((state) => state.fetchActivities);

  return {
    markAsRead,
    markAllAsRead,
    clearActivities,
    fetchActivities,
  };
};

export const useActivityFilters = () => {
  const filterType = useActivityStore((state) => state.filterType);
  const showUnreadOnly = useActivityStore((state) => state.showUnreadOnly);
  const setFilterType = useActivityStore((state) => state.setFilterType);
  const setShowUnreadOnly = useActivityStore((state) => state.setShowUnreadOnly);

  return {
    filterType,
    showUnreadOnly,
    setFilterType,
    setShowUnreadOnly,
  };
};

/**
 * Notification hooks
 */
export const useNotifications = () => {
  const notifications = useNotificationStore((state) => state.getFilteredNotifications());
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const isLoading = useNotificationStore((state) => state.isLoading);

  return {
    notifications,
    unreadCount,
    isLoading,
  };
};

export const useToasts = () => {
  const toasts = useNotificationStore((state) => state.toasts);
  const showToast = useNotificationStore((state) => state.showToast);
  const hideToast = useNotificationStore((state) => state.hideToast);
  const clearToasts = useNotificationStore((state) => state.clearToasts);

  return {
    toasts,
    showToast,
    hideToast,
    clearToasts,
  };
};

export const useNotificationActions = () => {
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const dismissNotification = useNotificationStore((state) => state.dismissNotification);
  const clearNotifications = useNotificationStore((state) => state.clearNotifications);
  const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);

  return {
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearNotifications,
    fetchNotifications,
  };
};

export const useNotificationSettings = () => {
  const soundEnabled = useNotificationStore((state) => state.soundEnabled);
  const desktopEnabled = useNotificationStore((state) => state.desktopEnabled);
  const setSoundEnabled = useNotificationStore((state) => state.setSoundEnabled);
  const setDesktopEnabled = useNotificationStore((state) => state.setDesktopEnabled);

  return {
    soundEnabled,
    desktopEnabled,
    setSoundEnabled,
    setDesktopEnabled,
  };
};

export const useNotificationFilters = () => {
  const filterType = useNotificationStore((state) => state.filterType);
  const filterPriority = useNotificationStore((state) => state.filterPriority);
  const showUnreadOnly = useNotificationStore((state) => state.showUnreadOnly);
  const setFilterType = useNotificationStore((state) => state.setFilterType);
  const setFilterPriority = useNotificationStore((state) => state.setFilterPriority);
  const setShowUnreadOnly = useNotificationStore((state) => state.setShowUnreadOnly);

  return {
    filterType,
    filterPriority,
    showUnreadOnly,
    setFilterType,
    setFilterPriority,
    setShowUnreadOnly,
  };
};

/**
 * Presence hooks
 */
export const usePresence = () => {
  const presence = usePresenceStore((state) => Array.from(state.presence.values()));
  const myStatus = usePresenceStore((state) => state.myStatus);
  const isLoading = usePresenceStore((state) => state.isLoading);

  return {
    presence,
    myStatus,
    isLoading,
  };
};

export const useUserPresence = (userId: string) => {
  const getPresence = usePresenceStore((state) => state.getPresence);
  const isUserOnline = usePresenceStore((state) => state.isUserOnline);

  return {
    presence: getPresence(userId),
    isOnline: isUserOnline(userId),
  };
};

export const useOnlineUsers = () => {
  const getOnlineUsers = usePresenceStore((state) => state.getOnlineUsers);
  return getOnlineUsers();
};

export const usePresenceActions = () => {
  const updateMyStatus = usePresenceStore((state) => state.updateMyStatus);
  const fetchPresence = usePresenceStore((state) => state.fetchPresence);
  const requestPresence = usePresenceStore((state) => state.requestPresence);

  return {
    updateMyStatus,
    fetchPresence,
    requestPresence,
  };
};

export const useTenantPresence = (tenantId: string) => {
  const getTenantPresence = usePresenceStore((state) => state.getTenantPresence);
  return getTenantPresence(tenantId);
};

export default {
  useAuth,
  usePermissions,
  useDeployments,
  useDeployment,
  useDeploymentLogs,
  useActiveDeployments,
  useTheme,
  useSidebar,
  useTablePreferences,
  useNotificationPreferences,
  useRecentItems,
  useAuthenticatedUser,
  useDeploymentActions,
  useWebSocketConnection,
  useActivities,
  useRecentActivities,
  useActivityActions,
  useActivityFilters,
  useNotifications,
  useToasts,
  useNotificationActions,
  useNotificationSettings,
  useNotificationFilters,
  usePresence,
  useUserPresence,
  useOnlineUsers,
  usePresenceActions,
  useTenantPresence,
};

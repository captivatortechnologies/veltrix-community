/**
 * Store Index
 * 
 * Central export for all stores and hooks.
 */

// Stores
import { useAuthStore } from './authStore';
import { useDeploymentStore, DeploymentStatus } from './deploymentStore';
import { usePreferencesStore } from './preferencesStore';
import { useActivityStore, ActivityType } from './activityStore';
import { useNotificationStore, NotificationPriority, NotificationType, requestNotificationPermission } from './notificationStore';
import { usePresenceStore, PresenceStatus } from './presenceStore';

export { 
  useAuthStore, 
  useDeploymentStore, 
  DeploymentStatus, 
  usePreferencesStore,
  useActivityStore,
  ActivityType,
  useNotificationStore,
  NotificationPriority,
  NotificationType,
  requestNotificationPermission,
  usePresenceStore,
  PresenceStatus,
};

// Types
export type { Deployment, DeploymentLog } from './deploymentStore';
export type { Theme, SidebarState, TableDensity, TablePreferences, DashboardLayout } from './preferencesStore';
export type { Activity } from './activityStore';
export type { Notification, ToastNotification } from './notificationStore';
export type { UserPresence } from './presenceStore';

// Hooks
export {
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
} from './hooks';

// Store utilities
export const resetAllStores = () => {
  useAuthStore.getState().reset();
  useDeploymentStore.getState().reset();
  usePreferencesStore.getState().resetAll();
  useActivityStore.getState().reset();
  useNotificationStore.getState().reset();
  usePresenceStore.getState().reset();
};

export const initializeStores = (accessToken?: string) => {
  const authState = useAuthStore.getState();
  const deploymentState = useDeploymentStore.getState();
  const preferencesState = usePreferencesStore.getState();

  // Validate auth token if present
  if (authState.isAuthenticated && accessToken) {
    authState.validateToken();
  }

  // Connect to WebSocket if authenticated
  if (authState.isAuthenticated && accessToken) {
    deploymentState.connect(accessToken);
  }

  // Apply theme
  preferencesState.setTheme(preferencesState.theme);
  
  // Initialize presence tracking
  if (authState.user?.tenantId) {
    usePresenceStore.getState().fetchPresence(authState.user.tenantId);
  }
  
  // Fetch initial notifications
  if (authState.user?.id) {
    useNotificationStore.getState().fetchNotifications(authState.user.id);
  }
  
  // Fetch initial activities
  if (authState.user?.tenantId) {
    useActivityStore.getState().fetchActivities(authState.user.tenantId);
  }
};

export default {
  useAuthStore,
  useDeploymentStore,
  usePreferencesStore,
  useActivityStore,
  useNotificationStore,
  usePresenceStore,
  resetAllStores,
  initializeStores,
};

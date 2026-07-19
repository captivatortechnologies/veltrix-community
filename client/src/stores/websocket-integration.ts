/**
 * WebSocket Integration
 * 
 * Connects all stores to real-time WebSocket events.
 */

import { Socket } from 'socket.io-client';
import { useDeploymentStore, DeploymentStatus } from './deploymentStore';
import { useActivityStore, createDeploymentActivity, ActivityType } from './activityStore';
import { useNotificationStore, NotificationPriority, NotificationType } from './notificationStore';
import { usePresenceStore, PresenceStatus } from './presenceStore';

/**
 * Map a server-emitted deployment status string onto the store's
 * DeploymentStatus enum. Unknown statuses map to undefined so the caller
 * can leave the stored status untouched.
 *
 * NOTE: deploymentStore imports this module at its top level (circular),
 * so the enum must be referenced lazily at call time — a module-level
 * lookup table would read DeploymentStatus before its module initializes.
 */
const mapDeploymentStatus = (status: string): DeploymentStatus | undefined => {
  switch (status) {
    case 'pending':
    case 'queued':
      return DeploymentStatus.QUEUED;
    case 'building':
      return DeploymentStatus.BUILDING;
    case 'running':
    case 'deploying':
      return DeploymentStatus.DEPLOYING;
    case 'completed':
      return DeploymentStatus.COMPLETED;
    case 'failed':
      return DeploymentStatus.FAILED;
    case 'cancelled':
      return DeploymentStatus.CANCELLED;
    default:
      return undefined;
  }
};

/**
 * Setup WebSocket event listeners for all stores
 */
export const setupWebSocketListeners = (socket: Socket) => {
  // Deployment events
  socket.on('deployment:status', (data: {
    deploymentId: string;
    status: string;
    progress: number;
    message?: string;
    userId: string;
    userName: string;
    tenantId: string;
  }) => {
    // Update deployment store (omit status entirely for unknown strings so
    // the merge doesn't clobber the stored status with undefined)
    const mappedStatus = mapDeploymentStatus(data.status);
    useDeploymentStore.getState().updateDeployment(data.deploymentId, {
      ...(mappedStatus !== undefined ? { status: mappedStatus } : {}),
      progress: data.progress,
      message: data.message,
    });

    // Add activity
    const activity = createDeploymentActivity(data);
    useActivityStore.getState().addActivity(activity);

    // Add notification for completed/failed deployments
    if (data.status === 'completed' || data.status === 'failed') {
      useNotificationStore.getState().addNotification({
        id: `notif-${Date.now()}-${Math.random()}`,
        type: data.status === 'completed' ? NotificationType.SUCCESS : NotificationType.ERROR,
        priority: data.status === 'failed' ? NotificationPriority.HIGH : NotificationPriority.MEDIUM,
        title: data.status === 'completed' ? 'Deployment Completed' : 'Deployment Failed',
        message: data.message || `Deployment ${data.deploymentId} ${data.status}`,
        userId: data.userId,
        tenantId: data.tenantId,
        metadata: { deploymentId: data.deploymentId },
        read: false,
        dismissed: false,
        createdAt: Date.now(),
        actionUrl: `/deployments/${data.deploymentId}`,
        actionLabel: 'View Details',
      });
    }
  });

  socket.on('deployment:progress', (data: {
    deploymentId: string;
    progress: number;
    message?: string;
  }) => {
    useDeploymentStore.getState().updateDeployment(data.deploymentId, {
      progress: data.progress,
      message: data.message,
    });
  });

  socket.on('deployment:log', (data: {
    deploymentId: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: number;
  }) => {
    useDeploymentStore.getState().addLog(data);
  });

  socket.on('deployment:error', (data: {
    deploymentId: string;
    error: string;
    userId: string;
    tenantId: string;
  }) => {
    useNotificationStore.getState().addNotification({
      id: `notif-${Date.now()}-${Math.random()}`,
      type: NotificationType.ERROR,
      priority: NotificationPriority.HIGH,
      title: 'Deployment Error',
      message: data.error,
      userId: data.userId,
      tenantId: data.tenantId,
      metadata: { deploymentId: data.deploymentId },
      read: false,
      dismissed: false,
      createdAt: Date.now(),
      actionUrl: `/deployments/${data.deploymentId}`,
      actionLabel: 'View Details',
    });
  });

  // Presence events
  socket.on('presence:online', (data: {
    userId: string;
    userName: string;
    userAvatar?: string;
    tenantId: string;
  }) => {
    usePresenceStore.getState().setPresence(data.userId, {
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      status: PresenceStatus.ONLINE,
      lastSeen: Date.now(),
      tenantId: data.tenantId,
    });

    // Add activity
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.USER_JOINED,
      userId: data.userId,
      userName: data.userName,
      tenantId: data.tenantId,
      message: `${data.userName} joined`,
      timestamp: Date.now(),
      read: false,
    });
  });

  socket.on('presence:offline', (data: {
    userId: string;
    userName: string;
    tenantId: string;
  }) => {
    usePresenceStore.getState().setPresence(data.userId, {
      userId: data.userId,
      userName: data.userName,
      status: PresenceStatus.OFFLINE,
      lastSeen: Date.now(),
      tenantId: data.tenantId,
    });

    // Add activity
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.USER_LEFT,
      userId: data.userId,
      userName: data.userName,
      tenantId: data.tenantId,
      message: `${data.userName} left`,
      timestamp: Date.now(),
      read: false,
    });
  });

  socket.on('presence:response', (data: {
    userId: string;
    userName: string;
    userAvatar?: string;
    status: PresenceStatus;
    lastSeen: number;
    tenantId: string;
  }) => {
    usePresenceStore.getState().setPresence(data.userId, data);
  });

  // Activity events
  socket.on('activity:new', (data: {
    id: string;
    type: ActivityType;
    userId: string;
    userName: string;
    tenantId: string;
    message: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
  }) => {
    useActivityStore.getState().addActivity({
      ...data,
      read: false,
    });
  });

  // Notification events
  socket.on('notification:new', (data: {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    userId: string;
    tenantId: string;
    metadata?: Record<string, unknown>;
    actionUrl?: string;
    actionLabel?: string;
    expiresAt?: number;
  }) => {
    useNotificationStore.getState().addNotification({
      ...data,
      read: false,
      dismissed: false,
      createdAt: Date.now(),
    });
  });

  // Tool events
  socket.on('tool:added', (data: {
    toolId: string;
    toolName: string;
    userId: string;
    userName: string;
    tenantId: string;
  }) => {
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.TOOL_ADDED,
      userId: data.userId,
      userName: data.userName,
      tenantId: data.tenantId,
      message: `${data.userName} added tool ${data.toolName}`,
      metadata: { toolId: data.toolId },
      timestamp: Date.now(),
      read: false,
    });
  });

  socket.on('tool:removed', (data: {
    toolId: string;
    toolName: string;
    userId: string;
    userName: string;
    tenantId: string;
  }) => {
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.TOOL_REMOVED,
      userId: data.userId,
      userName: data.userName,
      tenantId: data.tenantId,
      message: `${data.userName} removed tool ${data.toolName}`,
      metadata: { toolId: data.toolId },
      timestamp: Date.now(),
      read: false,
    });
  });

  // Config events
  socket.on('config:updated', (data: {
    configId: string;
    configName: string;
    userId: string;
    userName: string;
    tenantId: string;
  }) => {
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.CONFIG_UPDATED,
      userId: data.userId,
      userName: data.userName,
      tenantId: data.tenantId,
      message: `${data.userName} updated configuration ${data.configName}`,
      metadata: { configId: data.configId },
      timestamp: Date.now(),
      read: false,
    });

    useNotificationStore.getState().addNotification({
      id: `notif-${Date.now()}-${Math.random()}`,
      type: NotificationType.INFO,
      priority: NotificationPriority.LOW,
      title: 'Configuration Updated',
      message: `${data.userName} updated ${data.configName}`,
      userId: data.userId,
      tenantId: data.tenantId,
      metadata: { configId: data.configId },
      read: false,
      dismissed: false,
      createdAt: Date.now(),
    });
  });

  // Alert events
  socket.on('alert:triggered', (data: {
    alertId: string;
    alertName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    tenantId: string;
  }) => {
    const priorityMap = {
      low: NotificationPriority.LOW,
      medium: NotificationPriority.MEDIUM,
      high: NotificationPriority.HIGH,
      critical: NotificationPriority.CRITICAL,
    };

    useNotificationStore.getState().addNotification({
      id: `notif-${Date.now()}-${Math.random()}`,
      type: NotificationType.WARNING,
      priority: priorityMap[data.severity],
      title: `Alert: ${data.alertName}`,
      message: data.message,
      userId: '', // System notification
      tenantId: data.tenantId,
      metadata: { alertId: data.alertId, severity: data.severity },
      read: false,
      dismissed: false,
      createdAt: Date.now(),
      actionUrl: `/alerts/${data.alertId}`,
      actionLabel: 'View Alert',
    });

    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.ALERT_TRIGGERED,
      userId: '', // System activity
      userName: 'System',
      tenantId: data.tenantId,
      message: `Alert triggered: ${data.alertName}`,
      metadata: { alertId: data.alertId, severity: data.severity },
      timestamp: Date.now(),
      read: false,
    });
  });

  // Canvas collaboration events - Activity tracking
  socket.on('canvas:user:joined', (data: {
    user: { id: string; name: string };
    usersCount: number;
  }) => {
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.USER_JOINED,
      userId: data.user.id,
      userName: data.user.name,
      tenantId: '',
      message: `${data.user.name} joined the canvas`,
      timestamp: Date.now(),
      read: false,
    });
  });

  socket.on('canvas:user:left', (data: {
    userId: string;
    userName: string;
    usersCount: number;
  }) => {
    useActivityStore.getState().addActivity({
      id: `activity-${Date.now()}-${Math.random()}`,
      type: ActivityType.USER_LEFT,
      userId: data.userId,
      userName: data.userName,
      tenantId: '',
      message: `${data.userName} left the canvas`,
      timestamp: Date.now(),
      read: false,
    });
  });
};

/**
 * Cleanup WebSocket event listeners
 */
export const cleanupWebSocketListeners = (socket: Socket) => {
  socket.off('deployment:status');
  socket.off('deployment:progress');
  socket.off('deployment:log');
  socket.off('deployment:error');
  socket.off('presence:online');
  socket.off('presence:offline');
  socket.off('presence:response');
  socket.off('activity:new');
  socket.off('notification:new');
  socket.off('tool:added');
  socket.off('tool:removed');
  socket.off('config:updated');
  socket.off('alert:triggered');
  // Canvas collaboration events
  socket.off('canvas:user:joined');
  socket.off('canvas:user:left');
};

export default {
  setupWebSocketListeners,
  cleanupWebSocketListeners,
};

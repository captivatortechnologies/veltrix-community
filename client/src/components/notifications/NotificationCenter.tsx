/**
 * Notification Center
 * 
 * Displays notification list with filtering and actions.
 */

import React from 'react';
import {
  useNotifications,
  useNotificationActions,
  useNotificationFilters,
  NotificationType,
  NotificationPriority,
} from '../../stores';

interface NotificationCenterProps {
  className?: string;
}

const typeIcons: Record<NotificationType, string> = {
  [NotificationType.INFO]: 'ℹ️',
  [NotificationType.SUCCESS]: '✅',
  [NotificationType.WARNING]: '⚠️',
  [NotificationType.ERROR]: '❌',
};

const priorityBadgeClasses: Record<NotificationPriority, string> = {
  [NotificationPriority.LOW]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  [NotificationPriority.MEDIUM]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  [NotificationPriority.HIGH]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  [NotificationPriority.CRITICAL]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  className = '',
}) => {
  const { notifications, unreadCount, isLoading } = useNotifications();
  const { markAsRead, markAllAsRead, dismissNotification, clearNotifications } = useNotificationActions();
  const { filterType, filterPriority, showUnreadOnly, setFilterType, setFilterPriority, setShowUnreadOnly } = useNotificationFilters();

  const handleNotificationClick = (notificationId: string, actionUrl?: string) => {
    markAsRead(notificationId);
    if (actionUrl) {
      window.location.href = actionUrl;
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => markAllAsRead()}
            disabled={unreadCount === 0}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Mark all read
          </button>
          <button
            onClick={() => clearNotifications()}
            disabled={notifications.length === 0}
            className="text-sm text-red-600 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as NotificationType | 'all')}
          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Types</option>
          <option value={NotificationType.INFO}>Info</option>
          <option value={NotificationType.SUCCESS}>Success</option>
          <option value={NotificationType.WARNING}>Warning</option>
          <option value={NotificationType.ERROR}>Error</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as NotificationPriority | 'all')}
          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Priorities</option>
          <option value={NotificationPriority.LOW}>Low</option>
          <option value={NotificationPriority.MEDIUM}>Medium</option>
          <option value={NotificationPriority.HIGH}>High</option>
          <option value={NotificationPriority.CRITICAL}>Critical</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showUnreadOnly}
            onChange={(e) => setShowUnreadOnly(e.target.checked)}
            className="rounded"
          />
          Unread only
        </label>
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                  !notification.read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                }`}
                onClick={() => handleNotificationClick(notification.id, notification.actionUrl)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{typeIcons[notification.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {notification.title}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityBadgeClasses[notification.priority]}`}>
                        {notification.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotification(notification.id);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;

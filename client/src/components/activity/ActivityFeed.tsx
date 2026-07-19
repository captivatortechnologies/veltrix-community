/**
 * Activity Feed
 * 
 * Displays real-time activity feed with filtering.
 */

import React from 'react';
import {
  useActivities,
  useActivityActions,
  useActivityFilters,
  ActivityType,
} from '../../stores';

interface ActivityFeedProps {
  className?: string;
  maxItems?: number;
}

const activityIcons: Record<ActivityType, string> = {
  [ActivityType.DEPLOYMENT_STARTED]: '🚀',
  [ActivityType.DEPLOYMENT_COMPLETED]: '✅',
  [ActivityType.DEPLOYMENT_FAILED]: '❌',
  [ActivityType.TOOL_ADDED]: '🔧',
  [ActivityType.TOOL_REMOVED]: '🗑️',
  [ActivityType.USER_JOINED]: '👋',
  [ActivityType.USER_LEFT]: '👋',
  [ActivityType.CONFIG_UPDATED]: '⚙️',
  [ActivityType.ALERT_TRIGGERED]: '🚨',
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  className = '',
  maxItems,
}) => {
  const { activities, unreadCount, isLoading } = useActivities();
  const { markAsRead, markAllAsRead, clearActivities } = useActivityActions();
  const { filterType, showUnreadOnly, setFilterType, setShowUnreadOnly } = useActivityFilters();

  const displayedActivities = maxItems ? activities.slice(0, maxItems) : activities;

  const getRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Activity Feed
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
            onClick={() => clearActivities()}
            disabled={activities.length === 0}
            className="text-sm text-red-600 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ActivityType | 'all')}
          className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Activities</option>
          <option value={ActivityType.DEPLOYMENT_STARTED}>Deployments Started</option>
          <option value={ActivityType.DEPLOYMENT_COMPLETED}>Deployments Completed</option>
          <option value={ActivityType.DEPLOYMENT_FAILED}>Deployments Failed</option>
          <option value={ActivityType.TOOL_ADDED}>Tools Added</option>
          <option value={ActivityType.TOOL_REMOVED}>Tools Removed</option>
          <option value={ActivityType.USER_JOINED}>Users Joined</option>
          <option value={ActivityType.USER_LEFT}>Users Left</option>
          <option value={ActivityType.CONFIG_UPDATED}>Config Updates</option>
          <option value={ActivityType.ALERT_TRIGGERED}>Alerts</option>
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

      {/* Activities list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : displayedActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">No activity</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayedActivities.map((activity) => (
              <div
                key={activity.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                  !activity.read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                }`}
                onClick={() => markAsRead(activity.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{activityIcons[activity.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 mb-1">
                      {activity.message}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {getRelativeTime(activity.timestamp)}
                    </span>
                  </div>
                  {!activity.read && (
                    <span className="w-2 h-2 bg-blue-600 rounded-full mt-2" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;

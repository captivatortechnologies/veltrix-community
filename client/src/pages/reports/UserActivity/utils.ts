/**
 * Utility functions for the User Activity module
 */
import { UserSession, UserAction } from './types';

/**
 * Format date for display
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).format(date);
};

/**
 * Format duration for display
 * @param minutes Duration in minutes
 * @returns Formatted duration string
 */
export const formatDuration = (minutes?: number): string => {
  if (minutes === undefined) return 'Active';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}m`;
  } else {
    return `${hours}h ${mins}m`;
  }
};

/**
 * Creates a date cutoff based on the selected time range
 * @param range Time range identifier ('24h', '7d', '30d', 'all')
 * @returns Date object representing the cutoff time
 */
export const getDateCutoff = (range: '24h' | '7d' | '30d' | 'all'): Date => {
  const now = new Date();
  
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default: // 'all'
      return new Date(0);
  }
};

/**
 * Filter sessions based on user filter, active status, and date range
 * @param sessions All sessions 
 * @param userFilter User ID to filter by (optional)
 * @param activeOnly Whether to show only active sessions
 * @param dateRange Date range to filter by
 * @returns Filtered sessions
 */
export const filterSessions = (
  sessions: UserSession[],
  userFilter: string,
  activeOnly: boolean,
  dateRange: '24h' | '7d' | '30d' | 'all'
): UserSession[] => {
  return sessions.filter(session => {
    // Filter by user
    if (userFilter && session.userId !== userFilter) {
      return false;
    }
    
    // Filter by active status
    if (activeOnly && !session.active) {
      return false;
    }
    
    // Filter by date range
    if (dateRange !== 'all') {
      const cutoff = getDateCutoff(dateRange);
      if (new Date(session.startTime) < cutoff) {
        return false;
      }
    }
    
    return true;
  });
};

/**
 * Filter actions based on user filter and date range
 * @param actions All actions
 * @param userFilter User ID to filter by (optional)
 * @param dateRange Date range to filter by
 * @returns Filtered actions
 */
export const filterActions = (
  actions: UserAction[],
  userFilter: string,
  dateRange: '24h' | '7d' | '30d' | 'all'
): UserAction[] => {
  return actions.filter(action => {
    // Filter by user
    if (userFilter && action.userId !== userFilter) {
      return false;
    }
    
    // Filter by date range
    if (dateRange !== 'all') {
      const cutoff = getDateCutoff(dateRange);
      if (new Date(action.timestamp) < cutoff) {
        return false;
      }
    }
    
    return true;
  });
};

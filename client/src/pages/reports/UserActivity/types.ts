/**
 * Type definitions for User Activity data
 */

export interface UserSession {
  id: string;
  userId: string;
  username: string;
  startTime: string;
  endTime?: string;
  duration?: number; // in minutes
  ipAddress: string;
  userAgent: string;
  location?: string;
  device?: string;
  active: boolean;
}

export interface UserStats {
  userId: string;
  username: string;
  totalSessions: number;
  averageSessionDuration: number; // in minutes
  lastActive: string;
  totalActions: number;
  mostFrequentAction: string;
  activeToday: boolean;
  role: string;
}

export interface UserAction {
  id: string;
  userId: string;
  username: string;
  timestamp: string;
  action: string;
  resourceType: string;
  resourceName?: string;
  details?: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
}

export type TabState = {
  activeTab: 'overview' | 'sessions' | 'actions';
  userFilter: string;
  activeOnly: boolean;
  dateRange: '24h' | '7d' | '30d' | 'all';
};

export const URL_PARAM_MAPPING = {
  activeTab: 'tab',
  userFilter: 'user',
  activeOnly: 'active',
  dateRange: 'period'
};

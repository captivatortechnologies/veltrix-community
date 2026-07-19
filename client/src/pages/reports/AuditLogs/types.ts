/**
 * Type definitions for Audit Logs module
 */

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  status: 'success' | 'failure' | 'warning';
  ipAddress: string;
  userAgent: string;
  location?: string;
  details?: string;
}

export interface LogFilterOptions {
  userId: string;
  action: string;
  resourceType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

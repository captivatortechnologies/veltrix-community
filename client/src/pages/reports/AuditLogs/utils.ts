/**
 * Utility functions for Audit Logs module
 */

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
    minute: 'numeric',
    second: 'numeric'
  }).format(date);
};

/**
 * Format IP address to add location if available
 * @param ipAddress IP address string
 * @param location Optional location string
 * @returns Formatted IP address with location
 */
export const formatIpWithLocation = (ipAddress: string, location?: string): string => {
  if (!location) return ipAddress;
  return `${ipAddress} (${location})`;
};

/**
 * Generate CSV export data from audit logs
 * @param logs Array of filtered audit logs
 * @returns Array of objects formatted for CSV export
 */
export const prepareExportData = (logs: Array<{
  timestamp: string;
  userName: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceName?: string;
  status: string;
  ipAddress: string;
  location?: string;
  details?: string;
}>): Record<string, unknown>[] => {
  return logs.map(log => ({
    Timestamp: formatDate(log.timestamp),
    User: log.userName,
    'User ID': log.userId,
    Action: log.action.toUpperCase(),
    'Resource Type': log.resourceType,
    'Resource Name': log.resourceName || '',
    Status: log.status.toUpperCase(),
    'IP Address': log.ipAddress,
    Location: log.location || '',
    Details: log.details || ''
  }));
};

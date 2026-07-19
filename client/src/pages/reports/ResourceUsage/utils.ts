/**
 * Utility functions for Resource Usage module
 */
import { ResourceUsage } from './types';

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
 * Format number with commas for thousands
 * @param num Number to format
 * @returns Formatted number string with commas
 */
export const formatNumber = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Format cost with dollar sign and decimal places
 * @param cost Cost in USD
 * @returns Formatted cost string with dollar sign
 */
export const formatCost = (cost: number): string => {
  return `$${cost.toFixed(2)}`;
};

/**
 * Filter resource usage data based on tenant, resource type, and time range
 * @param usages All resource usage data
 * @param tenant Tenant ID to filter by (optional)
 * @param resourceType Resource type to filter by (optional)
 * @param timeRange Time range to filter by ('24h', '7d', '30d')
 * @returns Filtered resource usage data
 */
export const filterResourceUsage = (
  usages: ResourceUsage[],
  tenant: string,
  resourceType: string,
  timeRange: '24h' | '7d' | '30d'
): ResourceUsage[] => {
  return usages.filter(usage => {
    // Filter by tenant
    if (tenant && usage.tenantId !== tenant) {
      return false;
    }
    
    // Filter by resource type
    if (resourceType && usage.resourceType !== resourceType) {
      return false;
    }
    
    // Filter by time range
    if (timeRange) {
      const now = new Date();
      let cutoff: Date;
      
      switch (timeRange) {
        case '24h':
          cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = new Date(0);
      }
      
      if (new Date(usage.timestamp) < cutoff) {
        return false;
      }
    }
    
    return true;
  });
};

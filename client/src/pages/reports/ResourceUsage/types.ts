/**
 * Type definitions for Resource Usage module
 */

export interface ResourceUsage {
  id: string;
  tenantId: string;
  tenantName: string;
  resourceType: string;
  resourceName: string;
  usageMetric: string;
  value: number;
  unit: string;
  timestamp: string;
  limit?: number;
  costUSD?: number;
}

export interface TenantResourceSummary {
  tenantId: string;
  tenantName: string;
  totalCost: number;
  computeUsage: number;
  storageUsage: number;
  networkUsage: number;
  usagePercentage: number;
  resourceCount: number;
}

export type TabState = {
  activeTab: 'overview' | 'details';
  tenant: string;
  resourceType: string;
  timeRange: '24h' | '7d' | '30d';
};

// URL parameter mapping for TabStateManager
export const URL_PARAM_MAPPING = {
  activeTab: 'tab',
  tenant: 'tenant',
  resourceType: 'resource',
  timeRange: 'period'
};

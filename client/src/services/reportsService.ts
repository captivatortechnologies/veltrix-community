import { useQuery } from '@tanstack/react-query';
import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Tenant Reports API client. Each endpoint returns real, tenant-scoped data
 * aggregated by the server (server/src/module/report). Response shapes mirror
 * server/src/module/report/report.types.ts and the per-report client types.
 */

// ---- Audit Logs ---------------------------------------------------------
export interface AuditLogsReportResponse {
  logs: {
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
  }[];
  users: { id: string; name: string }[];
  actions: string[];
  resourceTypes: string[];
}

// ---- User Activity ------------------------------------------------------
export interface UserActivityReportResponse {
  userStats: {
    userId: string;
    username: string;
    totalSessions: number;
    averageSessionDuration: number;
    lastActive: string;
    totalActions: number;
    mostFrequentAction: string;
    activeToday: boolean;
    role: string;
  }[];
  sessions: {
    id: string;
    userId: string;
    username: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    ipAddress: string;
    userAgent: string;
    location?: string;
    device?: string;
    active: boolean;
  }[];
  actions: {
    id: string;
    userId: string;
    username: string;
    timestamp: string;
    action: string;
    resourceType: string;
    resourceName?: string;
    details?: string;
  }[];
  users: { id: string; name: string; role: string }[];
}

// ---- Resource Usage -----------------------------------------------------
export interface ResourceUsageReportResponse {
  summaries: {
    tenantId: string;
    tenantName: string;
    totalCost: number;
    computeUsage: number;
    storageUsage: number;
    networkUsage: number;
    usagePercentage: number;
    resourceCount: number;
  }[];
  usage: {
    id: string;
    tenantId: string;
    tenantName: string;
    resourceType: 'compute' | 'storage' | 'network' | 'api' | 'database';
    resourceName: string;
    usageMetric: string;
    value: number;
    unit: string;
    timestamp: string;
    limit?: number;
    costUSD?: number;
  }[];
  tenants: { id: string; name: string }[];
  resourceTypes: string[];
}

// ---- Security Overview --------------------------------------------------
export interface SecurityOverviewReportResponse {
  scores: {
    overall: number;
    identityAccess: number;
    dataProtection: number;
    networkSecurity: number;
    deviceSecurity: number;
    applicationSecurity: number;
  };
  metrics: {
    activeAlerts: number;
    compliantFrameworks: number;
    totalFrameworks: number;
    criticalVulnerabilities: number;
  };
  violationsByService: { service: string; count: number }[];
  vulnerabilityTrend: { month: string; critical: number; high: number; medium: number; low: number }[];
  complianceStatus: { framework: string; status: 'Compliant' | 'Non-Compliant' | 'Warning'; lastChecked: string }[];
}

// ---- Compliance ---------------------------------------------------------
export type ComplianceStatusLong =
  | 'Compliant'
  | 'Non-Compliant'
  | 'Partially Compliant'
  | 'Not Applicable';

export interface ComplianceReportResponse {
  frameworks: {
    id: string;
    name: string;
    description: string;
    lastAssessment: string;
    status: ComplianceStatusLong;
    score: number;
    controls: { total: number; compliant: number; nonCompliant: number; notApplicable: number };
  }[];
  controls: {
    id: string;
    frameworkId: string;
    controlId: string;
    title: string;
    description: string;
    requirement: string;
    status: ComplianceStatusLong;
    evidence: string;
    lastTested: string;
    remediation?: string;
  }[];
}

async function get<T>(path: string): Promise<T> {
  const response = await authAxios.get<T>(`${API_URL}/reports/${path}`);
  return response.data;
}

export const reportsService = {
  getAuditLogs: () => get<AuditLogsReportResponse>('audit-logs'),
  getUserActivity: () => get<UserActivityReportResponse>('user-activity'),
  getResourceUsage: () => get<ResourceUsageReportResponse>('resource-usage'),
  getSecurityOverview: () => get<SecurityOverviewReportResponse>('security-overview'),
  getCompliance: () => get<ComplianceReportResponse>('compliance'),
};

// ---- React Query hooks --------------------------------------------------
const STALE_TIME = 60_000; // 1 min — reports are aggregates, not live data

export const useAuditLogsReport = () =>
  useQuery({ queryKey: ['reports', 'audit-logs'], queryFn: reportsService.getAuditLogs, staleTime: STALE_TIME });

export const useUserActivityReport = () =>
  useQuery({ queryKey: ['reports', 'user-activity'], queryFn: reportsService.getUserActivity, staleTime: STALE_TIME });

export const useResourceUsageReport = () =>
  useQuery({ queryKey: ['reports', 'resource-usage'], queryFn: reportsService.getResourceUsage, staleTime: STALE_TIME });

export const useSecurityOverviewReport = () =>
  useQuery({ queryKey: ['reports', 'security-overview'], queryFn: reportsService.getSecurityOverview, staleTime: STALE_TIME });

export const useComplianceReport = () =>
  useQuery({ queryKey: ['reports', 'compliance'], queryFn: reportsService.getCompliance, staleTime: STALE_TIME });

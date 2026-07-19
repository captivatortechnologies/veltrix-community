/**
 * Tenant Reports — response DTOs.
 *
 * These shapes are the API contract for the client Reports pages
 * (client/src/pages/reports/*). Field names + string-union values are
 * load-bearing (badge colors and charts switch on exact strings), so keep them
 * in sync with the client `types.ts` in each report folder.
 */

// ---- Audit Logs ---------------------------------------------------------
export type AuditStatus = 'success' | 'failure' | 'warning';

export interface AuditLogRow {
  id: string;
  timestamp: string; // ISO datetime
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  status: AuditStatus;
  ipAddress: string;
  userAgent: string;
  location?: string;
  details?: string;
}

export interface AuditLogsReport {
  logs: AuditLogRow[];
  users: { id: string; name: string }[];
  actions: string[];
  resourceTypes: string[];
}

// ---- User Activity ------------------------------------------------------
export interface UserSessionRow {
  id: string;
  userId: string;
  username: string;
  startTime: string; // ISO
  endTime?: string; // ISO
  duration?: number; // minutes; undefined => active
  ipAddress: string;
  userAgent: string;
  location?: string;
  device?: string;
  active: boolean;
}

export interface UserStatsRow {
  userId: string;
  username: string;
  totalSessions: number;
  averageSessionDuration: number; // minutes
  lastActive: string; // ISO
  totalActions: number;
  mostFrequentAction: string;
  activeToday: boolean;
  role: string;
}

export interface UserActionRow {
  id: string;
  userId: string;
  username: string;
  timestamp: string; // ISO
  action: string;
  resourceType: string;
  resourceName?: string;
  details?: string;
}

export interface UserActivityReport {
  userStats: UserStatsRow[];
  sessions: UserSessionRow[];
  actions: UserActionRow[];
  users: { id: string; name: string; role: string }[];
}

// ---- Resource Usage -----------------------------------------------------
export type ResourceKind = 'compute' | 'storage' | 'network' | 'api' | 'database';

export interface ResourceUsageRow {
  id: string;
  tenantId: string;
  tenantName: string;
  resourceType: ResourceKind;
  resourceName: string;
  usageMetric: string;
  value: number;
  unit: string;
  timestamp: string; // ISO
  limit?: number;
  costUSD?: number;
}

export interface TenantResourceSummaryRow {
  tenantId: string;
  tenantName: string;
  totalCost: number;
  computeUsage: number;
  storageUsage: number;
  networkUsage: number;
  usagePercentage: number;
  resourceCount: number;
}

export interface ResourceUsageReport {
  summaries: TenantResourceSummaryRow[];
  usage: ResourceUsageRow[];
  tenants: { id: string; name: string }[];
  resourceTypes: ResourceKind[];
}

// ---- Security Overview --------------------------------------------------
export interface SecurityScores {
  overall: number;
  identityAccess: number;
  dataProtection: number;
  networkSecurity: number;
  deviceSecurity: number;
  applicationSecurity: number;
}

export interface ServiceViolation {
  service: string;
  count: number;
}

export interface VulnerabilityTrendPoint {
  month: string; // 'Jan', 'Feb', ...
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export type FrameworkStatusShort = 'Compliant' | 'Non-Compliant' | 'Warning';

export interface ComplianceStatusRow {
  framework: string;
  status: FrameworkStatusShort;
  lastChecked: string;
}

export interface SecurityOverviewReport {
  scores: SecurityScores;
  metrics: {
    activeAlerts: number;
    compliantFrameworks: number;
    totalFrameworks: number;
    criticalVulnerabilities: number;
  };
  violationsByService: ServiceViolation[];
  vulnerabilityTrend: VulnerabilityTrendPoint[];
  complianceStatus: ComplianceStatusRow[];
}

// ---- Compliance ---------------------------------------------------------
export type ComplianceStatusLong =
  | 'Compliant'
  | 'Non-Compliant'
  | 'Partially Compliant'
  | 'Not Applicable';

export interface ComplianceFrameworkRow {
  id: string;
  name: string;
  description: string;
  lastAssessment: string; // 'YYYY-MM-DD'
  status: ComplianceStatusLong;
  score: number; // 0-100
  controls: {
    total: number;
    compliant: number;
    nonCompliant: number;
    notApplicable: number;
  };
}

export interface ComplianceControlRow {
  id: string;
  frameworkId: string;
  controlId: string;
  title: string;
  description: string;
  requirement: string;
  status: ComplianceStatusLong;
  evidence: string;
  lastTested: string; // ISO date
  remediation?: string;
}

export interface ComplianceReport {
  frameworks: ComplianceFrameworkRow[];
  controls: ComplianceControlRow[];
}

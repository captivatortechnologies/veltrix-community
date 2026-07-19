import prisma from '../../db';
import { loggerService } from '../../module/logger/logger.service';
import { computeTenantSignals, SignalState, TenantSignals } from './report.signals';
import {
  AuditLogRow,
  AuditLogsReport,
  AuditStatus,
  ComplianceControlRow,
  ComplianceFrameworkRow,
  ComplianceReport,
  ComplianceStatusLong,
  ResourceUsageReport,
  ResourceUsageRow,
  SecurityOverviewReport,
  UserActionRow,
  UserActivityReport,
  UserSessionRow,
  UserStatsRow,
} from './report.types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

async function getUserMap(customerId: string): Promise<Map<string, UserInfo>> {
  const users = await prisma.user.findMany({
    where: { customerId },
    select: { id: true, name: true, email: true, role: { select: { name: true } } },
  });
  const map = new Map<string, UserInfo>();
  for (const u of users) {
    map.set(u.id, { name: u.name || u.email, email: u.email, role: u.role?.name || 'User' });
  }
  return map;
}

function nameFor(map: Map<string, UserInfo>, userId?: string | null, fallback?: string | null): string {
  if (userId && map.has(userId)) return map.get(userId)!.name;
  return fallback || 'System';
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

// ---- Audit Logs ---------------------------------------------------------
async function buildAuditLogs(customerId: string): Promise<AuditLogsReport> {
  const userMap = await getUserMap(customerId);

  const [auditEvents, history, deployments] = await Promise.all([
    prisma.auditEvent.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.configurationHistory.findMany({
      where: { customerId },
      orderBy: { timestamp: 'desc' },
      take: 400,
    }),
    prisma.deployment.findMany({ where: { customerId }, orderBy: { startedAt: 'desc' }, take: 200 }),
  ]);

  const rows: AuditLogRow[] = [];

  for (const e of auditEvents) {
    rows.push({
      id: `ae_${e.id}`,
      timestamp: e.createdAt.toISOString(),
      userId: e.userId || '',
      userName: nameFor(userMap, e.userId, e.actorName),
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId || undefined,
      resourceName: e.resourceName || undefined,
      status: (e.status as AuditStatus) || 'success',
      ipAddress: e.ipAddress || '—',
      userAgent: e.userAgent || '',
      location: e.location || undefined,
      details: e.details ? JSON.stringify(e.details) : undefined,
    });
  }

  for (const h of history) {
    rows.push({
      id: `ch_${h.id}`,
      timestamp: h.timestamp.toISOString(),
      userId: h.userId,
      userName: nameFor(userMap, h.userId),
      action: h.action.toLowerCase(),
      resourceType: h.entityType.toLowerCase(),
      resourceId: h.entityId,
      resourceName: h.entityName || undefined,
      status: h.action === 'REJECTED' ? 'warning' : 'success',
      ipAddress: '—',
      userAgent: '',
      details: h.details ? JSON.stringify(h.details) : (h.deployState || undefined),
    });
  }

  for (const d of deployments) {
    const status: AuditStatus =
      d.status === 'SUCCEEDED' ? 'success' : d.status === 'FAILED' ? 'failure' : 'warning';
    rows.push({
      id: `dep_${d.id}`,
      timestamp: d.startedAt.toISOString(),
      userId: d.triggeredById,
      userName: nameFor(userMap, d.triggeredById),
      action: 'deploy',
      resourceType: 'deployment',
      resourceId: d.id,
      resourceName: d.appId,
      status,
      ipAddress: '—',
      userAgent: '',
      details: `${d.strategy} deployment · ${d.status}`,
    });
  }

  rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const logs = rows.slice(0, 1000);

  const users = Array.from(userMap.entries()).map(([id, info]) => ({ id, name: info.name }));
  const actions = Array.from(new Set(logs.map((l) => l.action))).sort();
  const resourceTypes = Array.from(new Set(logs.map((l) => l.resourceType))).sort();

  return { logs, users, actions, resourceTypes };
}

// ---- User Activity ------------------------------------------------------
async function buildUserActivity(customerId: string): Promise<UserActivityReport> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [users, sessions, auditEvents, history] = await Promise.all([
    prisma.user.findMany({
      where: { customerId },
      select: {
        id: true,
        name: true,
        email: true,
        lastActivityAt: true,
        lastLoginAt: true,
        role: { select: { name: true } },
      },
    }),
    prisma.userSession.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.auditEvent.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    prisma.configurationHistory.findMany({
      where: { customerId },
      orderBy: { timestamp: 'desc' },
      take: 300,
    }),
  ]);

  const usernameById = new Map<string, string>();
  const roleById = new Map<string, string>();
  for (const u of users) {
    usernameById.set(u.id, u.name || u.email);
    roleById.set(u.id, u.role?.name || 'User');
  }

  // Per-user session aggregates.
  const sessionsByUser = new Map<string, { count: number; totalDuration: number; durationSamples: number }>();
  const now = Date.now();
  const sessionRows: UserSessionRow[] = sessions.map((s) => {
    const active = !s.revokedAt && (!s.expiresAt || s.expiresAt.getTime() > now);
    const duration = s.revokedAt ? minutesBetween(s.createdAt, s.revokedAt) : undefined;
    const agg = sessionsByUser.get(s.userId) || { count: 0, totalDuration: 0, durationSamples: 0 };
    agg.count += 1;
    if (duration !== undefined) {
      agg.totalDuration += duration;
      agg.durationSamples += 1;
    }
    sessionsByUser.set(s.userId, agg);
    return {
      id: s.id,
      userId: s.userId,
      username: usernameById.get(s.userId) || 'Unknown',
      startTime: s.createdAt.toISOString(),
      endTime: s.revokedAt ? s.revokedAt.toISOString() : undefined,
      duration,
      ipAddress: s.ipAddress || '—',
      userAgent: s.userAgent || '',
      location: s.location || undefined,
      device: s.device || undefined,
      active,
    };
  });

  // Per-user action aggregates from audit events + config history.
  const actionsByUser = new Map<string, { total: number; freq: Map<string, number> }>();
  const bump = (userId: string | null | undefined, action: string) => {
    if (!userId) return;
    const agg = actionsByUser.get(userId) || { total: 0, freq: new Map() };
    agg.total += 1;
    agg.freq.set(action, (agg.freq.get(action) || 0) + 1);
    actionsByUser.set(userId, agg);
  };

  const actionRows: UserActionRow[] = [];
  for (const e of auditEvents) {
    bump(e.userId, e.action);
    if (e.userId) {
      actionRows.push({
        id: `ae_${e.id}`,
        userId: e.userId,
        username: usernameById.get(e.userId) || e.actorName || 'System',
        timestamp: e.createdAt.toISOString(),
        action: e.action,
        resourceType: e.resourceType,
        resourceName: e.resourceName || undefined,
        details: e.details ? JSON.stringify(e.details) : undefined,
      });
    }
  }
  for (const h of history) {
    bump(h.userId, h.action.toLowerCase());
    actionRows.push({
      id: `ch_${h.id}`,
      userId: h.userId,
      username: usernameById.get(h.userId) || 'Unknown',
      timestamp: h.timestamp.toISOString(),
      action: h.action.toLowerCase(),
      resourceType: h.entityType.toLowerCase(),
      resourceName: h.entityName || undefined,
      details: h.details ? JSON.stringify(h.details) : undefined,
    });
  }
  actionRows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const userStats: UserStatsRow[] = users.map((u) => {
    const sAgg = sessionsByUser.get(u.id);
    const aAgg = actionsByUser.get(u.id);
    let mostFrequentAction = '—';
    if (aAgg && aAgg.freq.size > 0) {
      mostFrequentAction = Array.from(aAgg.freq.entries()).sort((x, y) => y[1] - x[1])[0][0];
    }
    const lastActive = u.lastActivityAt || u.lastLoginAt;
    return {
      userId: u.id,
      username: u.name || u.email,
      totalSessions: sAgg?.count || 0,
      averageSessionDuration: sAgg && sAgg.durationSamples > 0 ? Math.round(sAgg.totalDuration / sAgg.durationSamples) : 0,
      lastActive: (lastActive || u.lastLoginAt || new Date(0)).toISOString(),
      totalActions: aAgg?.total || 0,
      mostFrequentAction,
      activeToday: !!(u.lastActivityAt && u.lastActivityAt >= startOfToday),
      role: u.role?.name || 'User',
    };
  });

  const userRefs = users.map((u) => ({ id: u.id, name: u.name || u.email, role: u.role?.name || 'User' }));

  return {
    userStats,
    sessions: sessionRows.slice(0, 300),
    actions: actionRows.slice(0, 300),
    users: userRefs,
  };
}

// ---- Resource Usage -----------------------------------------------------
async function buildResourceUsage(customerId: string): Promise<ResourceUsageReport> {
  const [customer, components, credentials, providers, apps, sandboxes, connectivities] = await Promise.all([
    prisma.organization.findUnique({ where: { id: customerId }, select: { name: true } }),
    prisma.component.findMany({
      where: { customerId },
      select: { id: true, hostname: true, createdAt: true },
    }),
    prisma.credential.findMany({
      where: { customerId },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.connectivityProvider.findMany({
      where: { customerId },
      select: { id: true, name: true, providerType: true, createdAt: true },
    }),
    prisma.appInstallation.findMany({
      where: { customerId },
      select: { id: true, appId: true, installedAt: true, enabled: true },
    }),
    prisma.sandbox.findMany({
      where: { customerId },
      select: { id: true, name: true, sizeBytes: true, createdAt: true },
    }),
    prisma.componentConnectivity.findMany({
      where: { component: { is: { customerId } } },
      select: { status: true },
    }),
  ]);

  const tenantName = customer?.name || 'This tenant';
  const usage: ResourceUsageRow[] = [];

  for (const c of components) {
    usage.push({
      id: `cmp_${c.id}`,
      tenantId: customerId,
      tenantName,
      resourceType: 'compute',
      resourceName: c.hostname,
      usageMetric: 'deployment_target',
      value: 1,
      unit: 'instance',
      timestamp: c.createdAt.toISOString(),
    });
  }
  let storageGB = 0;
  for (const s of sandboxes) {
    const gb = Math.round((s.sizeBytes / 1e9) * 100) / 100;
    storageGB += gb;
    usage.push({
      id: `sbx_${s.id}`,
      tenantId: customerId,
      tenantName,
      resourceType: 'storage',
      resourceName: s.name,
      usageMetric: 'sandbox_disk',
      value: gb,
      unit: 'GB',
      timestamp: s.createdAt.toISOString(),
    });
  }
  for (const p of providers) {
    usage.push({
      id: `net_${p.id}`,
      tenantId: customerId,
      tenantName,
      resourceType: 'network',
      resourceName: p.name,
      usageMetric: p.providerType,
      value: 1,
      unit: 'connection',
      timestamp: p.createdAt.toISOString(),
    });
  }
  for (const a of apps) {
    usage.push({
      id: `app_${a.id}`,
      tenantId: customerId,
      tenantName,
      resourceType: 'api',
      resourceName: a.appId,
      usageMetric: a.enabled ? 'enabled_app' : 'installed_app',
      value: 1,
      unit: 'app',
      timestamp: a.installedAt.toISOString(),
    });
  }
  for (const cr of credentials) {
    usage.push({
      id: `crd_${cr.id}`,
      tenantId: customerId,
      tenantName,
      resourceType: 'database',
      resourceName: cr.name,
      usageMetric: 'stored_credential',
      value: 1,
      unit: 'secret',
      timestamp: cr.createdAt.toISOString(),
    });
  }

  usage.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  const connected = connectivities.filter(
    (c) => c.status === 'CONNECTED' || c.status === 'CONFIGURED',
  ).length;
  const usagePercentage = components.length > 0 ? Math.round((connected / components.length) * 100) : 0;
  const resourceCount = components.length + sandboxes.length + providers.length + apps.length + credentials.length;

  return {
    summaries: [
      {
        tenantId: customerId,
        tenantName,
        totalCost: 0,
        computeUsage: components.length,
        storageUsage: Math.round(storageGB * 100) / 100,
        networkUsage: providers.length,
        usagePercentage,
        resourceCount,
      },
    ],
    usage,
    tenants: [{ id: customerId, name: tenantName }],
    resourceTypes: ['compute', 'storage', 'network', 'api', 'database'],
  };
}

// ---- Compliance (shared with Security Overview) -------------------------
const STATE_TO_LONG: Record<SignalState, ComplianceStatusLong> = {
  COMPLIANT: 'Compliant',
  NON_COMPLIANT: 'Non-Compliant',
  PARTIALLY_COMPLIANT: 'Partially Compliant',
  NOT_APPLICABLE: 'Not Applicable',
};

function signalForCategory(signals: TenantSignals, category: string | null): { state: SignalState; evidence: string } {
  const key = (category || '') as keyof TenantSignals;
  const s = (signals as unknown as Record<string, { state: SignalState; evidence: string }>)[key];
  if (s) return { state: s.state, evidence: s.evidence };
  return { state: 'NOT_APPLICABLE', evidence: 'Manual assessment required.' };
}

async function buildCompliance(customerId: string): Promise<ComplianceReport> {
  const [frameworks, signals, overrides] = await Promise.all([
    prisma.complianceFramework.findMany({
      orderBy: { name: 'asc' },
      include: { controls: { orderBy: { code: 'asc' } } },
    }),
    computeTenantSignals(customerId),
    prisma.complianceControlStatus.findMany({ where: { customerId } }),
  ]);

  const overrideByControl = new Map(overrides.map((o) => [o.controlId, o]));
  const nowIso = new Date().toISOString().slice(0, 10);

  const frameworkRows: ComplianceFrameworkRow[] = [];
  const controlRows: ComplianceControlRow[] = [];

  for (const fw of frameworks) {
    let compliant = 0;
    let nonCompliant = 0;
    let notApplicable = 0;
    let latestAssessment = '';

    for (const control of fw.controls) {
      const override = overrideByControl.get(control.id);
      let state: SignalState;
      let evidence: string;
      let lastTested: string;
      let remediation: string | undefined;

      if (override) {
        state = override.status as SignalState;
        evidence = override.evidence || 'Manually assessed.';
        lastTested = (override.lastTestedAt || override.updatedAt).toISOString();
        remediation = override.remediation || undefined;
      } else {
        const derived = signalForCategory(signals, control.category);
        state = derived.state;
        evidence = derived.evidence;
        lastTested = new Date().toISOString();
      }

      if (state === 'COMPLIANT') compliant += 1;
      else if (state === 'NOT_APPLICABLE') notApplicable += 1;
      else nonCompliant += 1;

      const dateOnly = lastTested.slice(0, 10);
      if (dateOnly > latestAssessment) latestAssessment = dateOnly;

      controlRows.push({
        id: control.id,
        frameworkId: fw.id,
        controlId: control.code,
        title: control.title,
        description: control.description,
        requirement: control.requirement,
        status: STATE_TO_LONG[state],
        evidence,
        lastTested,
        remediation,
      });
    }

    const assessable = fw.controls.length - notApplicable;
    let status: ComplianceStatusLong;
    if (assessable === 0) status = 'Not Applicable';
    else if (compliant === assessable) status = 'Compliant';
    else if (compliant === 0) status = 'Non-Compliant';
    else status = 'Partially Compliant';
    const score = assessable === 0 ? 100 : Math.round((compliant / assessable) * 100);

    frameworkRows.push({
      id: fw.id,
      name: fw.name,
      description: fw.description,
      lastAssessment: latestAssessment || nowIso,
      status,
      score,
      controls: {
        total: fw.controls.length,
        compliant,
        nonCompliant,
        notApplicable,
      },
    });
  }

  return { frameworks: frameworkRows, controls: controlRows };
}

// ---- Security Overview --------------------------------------------------
function shortStatus(long: ComplianceStatusLong): 'Compliant' | 'Non-Compliant' | 'Warning' {
  if (long === 'Compliant') return 'Compliant';
  if (long === 'Non-Compliant') return 'Non-Compliant';
  return 'Warning';
}

function relativeDate(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

async function buildSecurityOverview(customerId: string): Promise<SecurityOverviewReport> {
  const signals = await computeTenantSignals(customerId);

  const [activeAlerts, criticalDrift, unresolvedDrift, compliance] = await Promise.all([
    prisma.platformAlert.count({ where: { customerId, isResolved: false } }),
    prisma.driftRecord.count({ where: { customerId, isResolved: false, severity: 'critical' } }),
    prisma.driftRecord.findMany({
      where: { customerId, isResolved: false },
      select: { appId: true },
    }),
    buildCompliance(customerId),
  ]);

  const scores = {
    identityAccess: signals.mfa.score,
    dataProtection: signals.encryption.score,
    networkSecurity: signals.network.score,
    deviceSecurity: signals.device.score,
    applicationSecurity: signals.drift.score,
    overall: 0,
  };
  scores.overall = Math.round(
    (scores.identityAccess +
      scores.dataProtection +
      scores.networkSecurity +
      scores.deviceSecurity +
      scores.applicationSecurity) /
      5,
  );

  // Violations by service = unresolved drift grouped by app.
  const violationMap = new Map<string, number>();
  for (const d of unresolvedDrift) violationMap.set(d.appId, (violationMap.get(d.appId) || 0) + 1);
  const violationsByService = Array.from(violationMap.entries())
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Vulnerability trend = drift over the last 6 months bucketed by severity.
  const trendDrift = await prisma.driftRecord.findMany({
    where: {
      customerId,
      detectedAt: { gte: new Date(Date.now() - 183 * 86400000) },
    },
    select: { severity: true, detectedAt: true },
  });
  const trend: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
  const months: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - i);
    const label = MONTH_NAMES[d.getMonth()];
    months.push(label);
    trend[label] = { critical: 0, high: 0, medium: 0, low: 0 };
  }
  for (const d of trendDrift) {
    const label = MONTH_NAMES[d.detectedAt.getMonth()];
    if (!trend[label]) continue;
    if (d.severity === 'critical') trend[label].critical += 1;
    else if (d.severity === 'warning') trend[label].high += 1;
    else trend[label].low += 1;
  }
  const vulnerabilityTrend = months.map((m) => ({ month: m, ...trend[m] }));

  const complianceStatus = compliance.frameworks.slice(0, 8).map((f) => ({
    framework: f.name,
    status: shortStatus(f.status),
    lastChecked: relativeDate(f.lastAssessment),
  }));
  const compliantFrameworks = compliance.frameworks.filter((f) => f.status === 'Compliant').length;

  return {
    scores,
    metrics: {
      activeAlerts,
      compliantFrameworks,
      totalFrameworks: compliance.frameworks.length,
      criticalVulnerabilities: criticalDrift,
    },
    violationsByService,
    vulnerabilityTrend,
    complianceStatus,
  };
}

export const reportService = {
  async auditLogs(customerId: string): Promise<AuditLogsReport> {
    return buildAuditLogs(customerId);
  },
  async userActivity(customerId: string): Promise<UserActivityReport> {
    return buildUserActivity(customerId);
  },
  async resourceUsage(customerId: string): Promise<ResourceUsageReport> {
    return buildResourceUsage(customerId);
  },
  async securityOverview(customerId: string): Promise<SecurityOverviewReport> {
    return buildSecurityOverview(customerId);
  },
  async compliance(customerId: string): Promise<ComplianceReport> {
    return buildCompliance(customerId);
  },
};

export type ReportService = typeof reportService;
export { loggerService };

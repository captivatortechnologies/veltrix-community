import prisma from '../../db';
import { isEncrypted } from '../../utils/encryption';

/**
 * Tenant security-posture signals, computed from REAL data. Shared by the
 * Security Overview and Compliance reports so both tell the same story.
 *
 * Each signal returns a 0-100 coverage score plus the raw counts, and a
 * derived control state ('COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT'
 * | 'NOT_APPLICABLE') used to auto-assess compliance controls.
 */

export type SignalState =
  | 'COMPLIANT'
  | 'PARTIALLY_COMPLIANT'
  | 'NON_COMPLIANT'
  | 'NOT_APPLICABLE';

export interface Signal {
  score: number; // 0-100
  covered: number;
  total: number;
  state: SignalState;
  evidence: string;
}

function toState(covered: number, total: number): SignalState {
  if (total === 0) return 'NOT_APPLICABLE';
  if (covered >= total) return 'COMPLIANT';
  if (covered === 0) return 'NON_COMPLIANT';
  return 'PARTIALLY_COMPLIANT';
}

function pct(covered: number, total: number): number {
  if (total === 0) return 100; // nothing at risk => fully covered
  return Math.round((covered / total) * 100);
}

export interface TenantSignals {
  encryption: Signal; // credential secrets encrypted at rest (data protection)
  mfa: Signal; // active users with 2FA or SSO (identity & access)
  network: Signal; // components reachable via a ZTNA connectivity provider
  device: Signal; // components with a healthy/connected connectivity status
  drift: Signal; // configuration drift resolved (application security)
  approvals: Signal; // environments governed by an approval policy
  auditLogging: Signal; // audit trail is being captured
  accessControl: Signal; // RBAC roles are defined
}

/**
 * Compute every tenant signal in one pass. All queries are scoped by customerId.
 */
export async function computeTenantSignals(customerId: string): Promise<TenantSignals> {
  const [
    credentials,
    activeUsers,
    usersWithMfa,
    ssoUsers,
    components,
    componentsWithProvider,
    connectivities,
    totalDrift,
    unresolvedDrift,
    environmentPolicies,
    auditEventCount,
    roleCount,
  ] = await Promise.all([
    prisma.credential.findMany({
      where: { customerId },
      select: { password: true, apiToken: true, certificate: true },
    }),
    prisma.user.count({ where: { customerId, isActive: true } }),
    prisma.user.count({
      where: { customerId, isActive: true, settings: { is: { twoFactorEnabled: true } } },
    }),
    prisma.user.count({
      where: { customerId, isActive: true, NOT: { authProvider: 'LOCAL' } },
    }),
    prisma.component.count({ where: { customerId } }),
    prisma.component.count({ where: { customerId, NOT: { connectivityProviderId: null } } }),
    prisma.componentConnectivity.findMany({
      where: { component: { is: { customerId } } },
      select: { status: true },
    }),
    prisma.driftRecord.count({ where: { customerId } }),
    prisma.driftRecord.count({ where: { customerId, isResolved: false } }),
    prisma.environmentPolicy.count({ where: { customerId } }),
    prisma.auditEvent.count({ where: { customerId } }),
    prisma.role.count({ where: { customerId } }),
  ]);

  // Encryption coverage over all non-empty credential secret fields.
  let secretTotal = 0;
  let secretEncrypted = 0;
  for (const c of credentials) {
    for (const val of [c.password, c.apiToken, c.certificate]) {
      if (typeof val === 'string' && val.length > 0) {
        secretTotal += 1;
        if (isEncrypted(val)) secretEncrypted += 1;
      }
    }
  }

  // MFA/SSO coverage: a user counts as covered if they have 2FA OR use SSO.
  // (usersWithMfa and ssoUsers can overlap; cap the covered count at the total.)
  const mfaCovered = Math.min(activeUsers, usersWithMfa + ssoUsers);

  const connectedDevices = connectivities.filter(
    (c) => c.status === 'CONNECTED' || c.status === 'CONFIGURED',
  ).length;

  const driftResolved = totalDrift - unresolvedDrift;

  return {
    encryption: {
      score: pct(secretEncrypted, secretTotal),
      covered: secretEncrypted,
      total: secretTotal,
      state: toState(secretEncrypted, secretTotal),
      evidence:
        secretTotal === 0
          ? 'No stored credential secrets.'
          : `${secretEncrypted}/${secretTotal} credential secrets encrypted at rest.`,
    },
    mfa: {
      score: pct(mfaCovered, activeUsers),
      covered: mfaCovered,
      total: activeUsers,
      state: toState(mfaCovered, activeUsers),
      evidence:
        activeUsers === 0
          ? 'No active users.'
          : `${mfaCovered}/${activeUsers} active users use MFA or SSO.`,
    },
    network: {
      score: pct(componentsWithProvider, components),
      covered: componentsWithProvider,
      total: components,
      state: toState(componentsWithProvider, components),
      evidence:
        components === 0
          ? 'No deployment targets registered.'
          : `${componentsWithProvider}/${components} targets reachable via a ZTNA provider.`,
    },
    device: {
      score: pct(connectedDevices, connectivities.length),
      covered: connectedDevices,
      total: connectivities.length,
      state: toState(connectedDevices, connectivities.length),
      evidence:
        connectivities.length === 0
          ? 'No target connectivity configured.'
          : `${connectedDevices}/${connectivities.length} targets report a healthy connection.`,
    },
    drift: {
      score: pct(driftResolved, totalDrift),
      covered: driftResolved,
      total: totalDrift,
      state: toState(driftResolved, totalDrift),
      evidence:
        totalDrift === 0
          ? 'No configuration drift detected.'
          : `${unresolvedDrift} unresolved drift record(s) of ${totalDrift} total.`,
    },
    approvals: {
      score: environmentPolicies > 0 ? 100 : 0,
      covered: environmentPolicies,
      total: Math.max(environmentPolicies, 1),
      state: environmentPolicies > 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      evidence:
        environmentPolicies > 0
          ? `${environmentPolicies} environment approval/rollback policy(ies) configured.`
          : 'No environment approval policy configured.',
    },
    auditLogging: {
      score: auditEventCount > 0 ? 100 : 0,
      covered: auditEventCount > 0 ? 1 : 0,
      total: 1,
      state: auditEventCount > 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      evidence:
        auditEventCount > 0
          ? `${auditEventCount} audit events recorded.`
          : 'No audit events recorded yet.',
    },
    accessControl: {
      score: roleCount > 0 ? 100 : 0,
      covered: roleCount,
      total: Math.max(roleCount, 1),
      state: roleCount > 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      evidence:
        roleCount > 0
          ? `${roleCount} RBAC role(s) defined.`
          : 'No RBAC roles defined.',
    },
  };
}

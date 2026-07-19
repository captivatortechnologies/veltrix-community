/**
 * RBAC permission resolver — single source of truth.
 *
 * Everything that needs to answer "can this role/user do X" goes through
 * this module: `authMiddleware.hasPermission`, `app-route-registrar`'s
 * `hasAppPermission`, `GET /api/me/permissions`, the login response, the
 * role-CRUD self-escalation guard, and the PipelineContext permission
 * snapshot handed to app pipeline handlers.
 *
 * Permission identity is `(resource, action, appId)`:
 *  - `appId = null`  -> platform-scoped permission (built-in resources).
 *  - `appId = <uuid>` -> app-scoped permission (an app's declared resource,
 *    or a config type keyed by `configTypeId`).
 *
 * Wildcard semantics:
 *  - `all:all`      -> total bypass, regardless of appId.
 *  - `resource:all` -> bypasses the action check for that resource.
 *  - A PLATFORM-scoped row (appId = null) also satisfies an app-scoped
 *    check for the same resource/action — "app-scoped checks satisfied by
 *    app-scoped row OR platform wildcard".
 *
 * Single-tenant note: this build has no separate "platform operator" /
 * cross-tenant admin concept (that only exists in the hosted multi-tenant
 * product). The seeded Administrator role IS the unrestricted admin for its
 * organization, expressed purely through the `all:all` wildcard grant below
 * — there is no secondary role-name bypass.
 */

import prisma from '../db';

/** Matches the Permission table shape, appId included (nullable). */
export interface PermissionRow {
  id: string;
  resource: string;
  action: string;
  roleId: string;
  appId: string | null;
}

/**
 * The subset of PermissionRow the matching functions actually read. Widened
 * so a `PermissionSnapshot.permissions` entry (which has no id/roleId) can
 * be checked directly, without re-fetching raw rows — used by page-level
 * requiresPermission filtering and anywhere else that only has an
 * already-resolved snapshot on hand.
 */
export type PermissionLike = Pick<PermissionRow, 'resource' | 'action' | 'appId'>;

export interface PermissionCheckOptions {
  /** App-scoped check target. Omit/undefined for a platform-scoped check. */
  appId?: string | null;
}

/** One entry of a resolved permission snapshot (see `buildPermissionSnapshot`). */
export interface PermissionSnapshotEntry {
  resource: string;
  action: string;
  appId: string | null;
}

export interface PermissionSnapshot {
  permissions: PermissionSnapshotEntry[];
  wildcards: {
    /** Role holds `all:all`. */
    allAll: boolean;
    /** Resource names the role holds a `resource:all` grant for. */
    resources: string[];
  };
}

/**
 * Load every Permission row for a role, appId included. Raw SQL — kept as a
 * single query so callers never need to duplicate the column list.
 */
export async function getRolePermissions(roleId: string): Promise<PermissionRow[]> {
  return prisma.$queryRaw<PermissionRow[]>`
    SELECT id, resource, action, "roleId", "appId" FROM "Permission" WHERE "roleId" = ${roleId}
  `;
}

/**
 * Normalizes appId for comparison: both `null` (from a raw-SQL NULL column)
 * and `undefined` (from a hand-built object literal, e.g. in tests) mean
 * "platform-scoped".
 */
function normalizedAppId(appId: string | null | undefined): string | null {
  return appId ?? null;
}

/**
 * True when the role holds the unrestricted `all:all` permission. Only a
 * PLATFORM-scoped (appId = null) `all:all` row counts — an app can never be
 * granted an unrestricted platform bypass through its own scoped resources.
 */
export function hasAllAllPermission(permissions: PermissionLike[]): boolean {
  return permissions.some(
    (p) => normalizedAppId(p.appId) === null && p.resource === 'all' && p.action === 'all',
  );
}

/** True when a row grants `resource` for `action` (exact) or `resource:all`. */
function matchesResourceAction(p: PermissionLike, resource: string, action: string): boolean {
  return p.resource === resource && (p.action === action || p.action === 'all');
}

/**
 * Core permission check. Pass `{ appId }` for an app-scoped resource (a
 * config type or an app-declared resource); omit it for a platform resource.
 */
export function checkPermission(
  permissions: PermissionLike[],
  resource: string,
  action: string,
  opts: PermissionCheckOptions = {},
): boolean {
  if (hasAllAllPermission(permissions)) return true;

  const targetAppId = normalizedAppId(opts.appId);

  // Exact-scope match: same appId (both platform, or the same app).
  if (
    permissions.some(
      (p) => normalizedAppId(p.appId) === targetAppId && matchesResourceAction(p, resource, action),
    )
  ) {
    return true;
  }

  // App-scoped checks are additionally satisfied by a platform wildcard —
  // a platform-scoped row (appId = null) granting the same resource/action.
  if (targetAppId !== null) {
    if (permissions.some((p) => normalizedAppId(p.appId) === null && matchesResourceAction(p, resource, action))) {
      return true;
    }
  }

  return false;
}

/**
 * True when `roleId` holds the unrestricted `all:all` grant. Single-tenant
 * OSS has no legacy platform-operator role name to also check — the
 * wildcard permission is the sole "unrestricted admin" signal.
 */
export async function isEffectivelyUnrestrictedAdmin(roleId: string): Promise<boolean> {
  const permissions = await getRolePermissions(roleId);
  return hasAllAllPermission(permissions);
}

/** Build the client-facing permission snapshot from resolved rows. */
export function buildPermissionSnapshot(permissions: PermissionRow[]): PermissionSnapshot {
  const allAll = hasAllAllPermission(permissions);
  const resources = Array.from(
    new Set(
      permissions
        .filter((p) => p.action === 'all' && p.resource !== 'all')
        .map((p) => p.resource),
    ),
  );

  return {
    permissions: permissions.map((p) => ({
      resource: p.resource,
      action: p.action,
      appId: p.appId ?? null,
    })),
    wildcards: { allAll, resources },
  };
}

/**
 * Check a resource/action/appId against an already-resolved snapshot (e.g.
 * one returned by `resolvePermissionSnapshotForUser`), without a fresh DB
 * round-trip. `wildcards.allAll` short-circuits to true.
 */
export function snapshotGrants(
  snapshot: PermissionSnapshot,
  resource: string,
  action: string,
  opts: PermissionCheckOptions = {},
): boolean {
  if (snapshot.wildcards.allAll) return true;
  return checkPermission(snapshot.permissions, resource, action, opts);
}

/**
 * Resolve the full permission snapshot for a user by id. Used wherever only
 * identity (not an already-loaded user+role record) is on hand — e.g. the
 * PipelineContext builders, which only carry `triggeredById`/`userId`.
 */
export async function resolvePermissionSnapshotForUser(userId: string): Promise<PermissionSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user) {
    return { permissions: [], wildcards: { allAll: false, resources: [] } };
  }

  const permissions = await getRolePermissions(user.roleId);
  return buildPermissionSnapshot(permissions);
}

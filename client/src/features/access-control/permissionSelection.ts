// ========================================================================
// Permission-selection helpers for the RoleManagement permission matrix
// (C3, Wave C RBAC/IdP hardening 2026-07-10). Pure functions over a
// `PermissionInput[]` selection — kept framework-free so the matrix
// components (PermissionMatrixSection, AppPermissionSection) and
// RoleFormDialog can all share one source of truth for "is this
// resource:action(:appId) currently selected".
// ========================================================================

import type { PermissionInput } from '../../services/roleService';

/** Normalizes appId for comparison: `null` and `undefined` both mean "platform-scoped". */
function normalizedAppId(appId: string | null | undefined): string | null {
  return appId ?? null;
}

/** Stable identity key for a permission grant, appId included. */
export function permissionKey(resource: string, action: string, appId?: string | null): string {
  return `${normalizedAppId(appId) ?? 'platform'}::${resource}::${action}`;
}

export function isPermissionSelected(
  selected: PermissionInput[],
  resource: string,
  action: string,
  appId?: string | null,
): boolean {
  const target = normalizedAppId(appId);
  return selected.some(
    (p) => p.resource === resource && p.action === action && normalizedAppId(p.appId) === target,
  );
}

/** Returns a NEW array with the given grant added or removed (toggled). */
export function togglePermission(
  selected: PermissionInput[],
  resource: string,
  action: string,
  appId?: string | null,
): PermissionInput[] {
  if (isPermissionSelected(selected, resource, action, appId)) {
    const target = normalizedAppId(appId);
    return selected.filter(
      (p) => !(p.resource === resource && p.action === action && normalizedAppId(p.appId) === target),
    );
  }
  return [...selected, { resource, action, appId: normalizedAppId(appId) }];
}

/** True when the selection holds the unrestricted platform `all:all` grant. */
export function hasAllAllSelected(selected: PermissionInput[]): boolean {
  return selected.some((p) => p.resource === 'all' && p.action === 'all' && normalizedAppId(p.appId) === null);
}

/**
 * Toggle the "Full platform access" grant. Enabling it CLEARS every other
 * selection (all:all already implies them, per server matching semantics —
 * see server/src/lib/permissions.ts / stores/permissionStore.ts); disabling
 * it just removes the one all:all row.
 */
export function setAllAllSelected(selected: PermissionInput[], enabled: boolean): PermissionInput[] {
  if (enabled) return [{ resource: 'all', action: 'all', appId: null }];
  return selected.filter((p) => !(p.resource === 'all' && p.action === 'all' && normalizedAppId(p.appId) === null));
}

/** Count of selected grants scoped to one app (or the platform, when `appId` is null). */
export function countForScope(selected: PermissionInput[], appId: string | null): number {
  return selected.filter((p) => normalizedAppId(p.appId) === appId).length;
}

/** "logForwarding" -> "Log Forwarding"; "apiKey" -> "Api Key". */
export function formatResourceLabel(resource: string): string {
  if (resource === 'all') return 'All resources';
  const withSpaces = resource
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ');
  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** "read" -> "Read"; "all" -> "All actions". */
export function formatActionLabel(action: string): string {
  if (action === 'all') return 'All actions';
  return action.charAt(0).toUpperCase() + action.slice(1);
}

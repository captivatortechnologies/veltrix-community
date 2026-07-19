/**
 * Permission store — client-side mirror of the server RBAC resolver.
 *
 * Wave C (RBAC/IdP hardening, 2026-07-10) — see design decisions 5-6 in
 * `_ai_tasks/rbac-idp-hardening/2026-07-10/01_plan.md`. This is the SINGLE
 * source of truth for "can the signed-in user do X" on the client: every
 * consumer (Sidebar, InstalledAppsPage, AppPageHost/AppShell, RoleManagement,
 * the SDK host runtime surface) reads through `usePermissionStore` or the
 * `usePermissions()` hook (`src/hooks/usePermissions.ts`), never a cached
 * role name or a guessed permission string.
 *
 * The matching semantics below (`checkPermission`, `hasAllAllPermission`,
 * `snapshotGrants`) are a DELIBERATE, exact mirror of
 * `server/src/lib/permissions.ts` — keep the two in lockstep. Permission
 * identity is `(resource, action, appId)`:
 *  - `appId = null`   -> platform-scoped permission (built-in resources).
 *  - `appId = <uuid>` -> app-scoped permission (an app's declared resource,
 *    or a config type keyed by `configTypeId`).
 *
 * Wildcards:
 *  - `all:all`      -> total bypass, regardless of appId.
 *  - `resource:all` -> bypasses the action check for that resource.
 *  - A PLATFORM-scoped row (appId = null) also satisfies an app-scoped check
 *    for the same resource/action ("app-scoped checks satisfied by app-scoped
 *    row OR platform wildcard").
 *
 * Fail-CLOSED by construction: `hasPermission` returns `false` for anything
 * not explicitly granted, including while the snapshot hasn't loaded yet
 * (`snapshot === null` behaves exactly like an empty, non-admin snapshot).
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types (mirrors server/src/lib/permissions.ts's PermissionSnapshot family)
// ---------------------------------------------------------------------------

/** One resolved permission entry, appId included (mirrors PermissionLike). */
export interface PermissionEntry {
  resource: string;
  action: string;
  appId: string | null;
}

export interface PermissionCheckOptions {
  /** App-scoped check target. Omit/undefined for a platform-scoped check. */
  appId?: string | null;
}

export interface PermissionWildcards {
  /** Role holds `all:all` (or the user is a platform admin). */
  allAll: boolean;
  /** Resource names the role holds a `resource:all` grant for. */
  resources: string[];
}

/** The exact response shape of `GET /api/me/permissions` and the login response's `permissions` block. */
export interface PermissionSnapshot {
  permissions: PermissionEntry[];
  wildcards: PermissionWildcards;
  isPlatformAdmin: boolean;
}

/** The snapshot for a signed-out / not-yet-loaded user: denies everything. */
export const EMPTY_PERMISSION_SNAPSHOT: PermissionSnapshot = {
  permissions: [],
  wildcards: { allAll: false, resources: [] },
  isPlatformAdmin: false,
};

// ---------------------------------------------------------------------------
// Matching logic — exact mirror of server/src/lib/permissions.ts
// ---------------------------------------------------------------------------

/** Normalizes appId for comparison: `null` and `undefined` both mean "platform-scoped". */
function normalizedAppId(appId: string | null | undefined): string | null {
  return appId ?? null;
}

/**
 * True when the role holds the unrestricted `all:all` permission. Only a
 * PLATFORM-scoped (appId = null) `all:all` row counts — an app can never be
 * granted an unrestricted platform bypass through its own scoped resources.
 */
export function hasAllAllPermission(permissions: PermissionEntry[]): boolean {
  return permissions.some(
    (p) => normalizedAppId(p.appId) === null && p.resource === 'all' && p.action === 'all',
  );
}

/** True when a row grants `resource` for `action` (exact) or `resource:all`. */
function matchesResourceAction(p: PermissionEntry, resource: string, action: string): boolean {
  return p.resource === resource && (p.action === action || p.action === 'all');
}

/**
 * Core permission check. Pass `{ appId }` for an app-scoped resource (a
 * config type or an app-declared resource); omit it for a platform resource.
 */
export function checkPermission(
  permissions: PermissionEntry[],
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

  // App-scoped checks are additionally satisfied by a platform wildcard — a
  // platform-scoped row (appId = null) granting the same resource/action.
  if (targetAppId !== null) {
    if (permissions.some((p) => normalizedAppId(p.appId) === null && matchesResourceAction(p, resource, action))) {
      return true;
    }
  }

  return false;
}

/**
 * Check a resource/action/appId against a resolved snapshot.
 * `isPlatformAdmin`/`wildcards.allAll` short-circuit to true.
 */
export function snapshotGrants(
  snapshot: PermissionSnapshot,
  resource: string,
  action: string,
  opts: PermissionCheckOptions = {},
): boolean {
  if (snapshot.isPlatformAdmin || snapshot.wildcards.allAll) return true;
  return checkPermission(snapshot.permissions, resource, action, opts);
}

// ---------------------------------------------------------------------------
// Cross-session cache — "instant availability" (design decision 5)
//
// Persists the last-resolved snapshot so a fresh mount (e.g. the full-page
// reload every login flow performs — see LoginPage/OAuthCallbackPage's
// `window.location.href` navigation) can hydrate synchronously instead of
// rendering fail-closed for one network round trip. Written by
// `usePermissions()` after every successful fetch (see src/hooks/usePermissions.ts)
// and read as react-query `initialData` on the next mount. Mirrors whichever
// storage authService.setAuthData chose (rememberMe-aware) so it survives
// exactly as long as the session token does, and is included in authService's
// TENANT_SCOPED_KEYS so logout clears it like every other session artifact.
// ---------------------------------------------------------------------------

export const PERMISSION_CACHE_KEY = 'veltrix_permissions_snapshot';

export function readCachedPermissionSnapshot(): PermissionSnapshot | null {
  try {
    const raw = localStorage.getItem(PERMISSION_CACHE_KEY) ?? sessionStorage.getItem(PERMISSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PermissionSnapshot;
    if (!parsed || !Array.isArray(parsed.permissions) || !parsed.wildcards) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedPermissionSnapshot(snapshot: PermissionSnapshot): void {
  try {
    // Mirror whichever storage currently holds the auth token (rememberMe-aware).
    const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
    storage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable (private mode, quota) — the query cache is still correct */
  }
}

export function clearCachedPermissionSnapshot(): void {
  try {
    localStorage.removeItem(PERMISSION_CACHE_KEY);
    sessionStorage.removeItem(PERMISSION_CACHE_KEY);
  } catch {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Store
//
// The synchronous bridge for non-React consumers (the SDK host runtime — see
// src/appRuntime/installHostRuntime.ts — calls `usePermissionStore.getState()`
// directly, since `VeltrixHostRuntime.permissions.has()` is a plain callable,
// not a hook). React consumers should prefer `usePermissions()`
// (src/hooks/usePermissions.ts), which subscribes reactively via react-query.
// ---------------------------------------------------------------------------

interface PermissionStoreState {
  snapshot: PermissionSnapshot | null;
  setSnapshot: (snapshot: PermissionSnapshot) => void;
  clear: () => void;
  /** Fail-closed: returns `false` for everything until a snapshot has loaded. */
  hasPermission: (resource: string, action: string, opts?: PermissionCheckOptions) => boolean;
  list: () => PermissionEntry[];
}

export const usePermissionStore = create<PermissionStoreState>((set, get) => ({
  snapshot: null,

  setSnapshot: (snapshot) => set({ snapshot }),

  clear: () => set({ snapshot: null }),

  hasPermission: (resource, action, opts) => {
    const { snapshot } = get();
    if (!snapshot) return false;
    return snapshotGrants(snapshot, resource, action, opts);
  },

  list: () => get().snapshot?.permissions ?? [],
}));

export default usePermissionStore;

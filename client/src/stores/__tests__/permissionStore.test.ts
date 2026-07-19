// ========================================================================
// Tests: permissionStore — the client-side mirror of the server RBAC
// resolver (server/src/lib/permissions.ts). The checkPermission/
// hasAllAllPermission/snapshotGrants matrix below deliberately mirrors
// server/src/lib/__tests__/permissions.test.ts case-for-case so the two
// can never silently drift.
// ========================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkPermission,
  hasAllAllPermission,
  snapshotGrants,
  usePermissionStore,
  EMPTY_PERMISSION_SNAPSHOT,
  readCachedPermissionSnapshot,
  writeCachedPermissionSnapshot,
  clearCachedPermissionSnapshot,
  PERMISSION_CACHE_KEY,
  type PermissionEntry,
  type PermissionSnapshot,
} from '../permissionStore';

const row = (resource: string, action: string, appId: string | null = null): PermissionEntry => ({
  resource,
  action,
  appId,
});

beforeEach(() => {
  usePermissionStore.setState({ snapshot: null });
  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// checkPermission — the full matrix: resource x action x appId x wildcards
// ---------------------------------------------------------------------------

describe('checkPermission', () => {
  it('denies when there are no permissions at all', () => {
    expect(checkPermission([], 'tool', 'read')).toBe(false);
  });

  it('all:all grants every platform check regardless of resource/action', () => {
    const perms = [row('all', 'all')];
    expect(checkPermission(perms, 'tool', 'read')).toBe(true);
    expect(checkPermission(perms, 'role', 'write')).toBe(true);
    expect(checkPermission(perms, 'anything', 'whatever')).toBe(true);
  });

  it('all:all grants every APP-scoped check too', () => {
    const perms = [row('all', 'all')];
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true);
  });

  it('exact platform resource:action match grants a platform check', () => {
    const perms = [row('tool', 'read')];
    expect(checkPermission(perms, 'tool', 'read')).toBe(true);
    expect(checkPermission(perms, 'tool', 'write')).toBe(false);
  });

  it('resource:all grants every action for that resource, platform-scoped', () => {
    const perms = [row('credential', 'all')];
    expect(checkPermission(perms, 'credential', 'read')).toBe(true);
    expect(checkPermission(perms, 'credential', 'write')).toBe(true);
    expect(checkPermission(perms, 'credential', 'delete')).toBe(true);
    expect(checkPermission(perms, 'tool', 'read')).toBe(false);
  });

  it('a platform-scoped row does NOT grant a DIFFERENT resource inside an app', () => {
    const perms = [row('indexes', 'read')]; // platform-scoped
    expect(checkPermission(perms, 'roles', 'read', { appId: 'app-1' })).toBe(false);
  });

  it('an app-scoped row grants the exact (resource, action, appId) match', () => {
    const perms = [row('indexes', 'read', 'app-1')];
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true);
  });

  it('an app-scoped row does NOT grant the same resource/action for a DIFFERENT app', () => {
    const perms = [row('indexes', 'read', 'app-1')];
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(false);
  });

  it('an app-scoped row does NOT satisfy a platform-scoped check of the same resource/action', () => {
    const perms = [row('indexes', 'read', 'app-1')];
    expect(checkPermission(perms, 'indexes', 'read')).toBe(false);
  });

  it('design decision 2: a PLATFORM row satisfies an APP-scoped check for the same resource/action (platform wildcard)', () => {
    const perms = [row('indexes', 'read')]; // appId = null
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true);
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(true); // any app
  });

  it('design decision 2: a platform resource:all satisfies an app-scoped action check for that resource', () => {
    const perms = [row('indexes', 'all')];
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true);
    expect(checkPermission(perms, 'indexes', 'delete', { appId: 'app-1' })).toBe(true);
  });

  it('app-scoped resource:all grants only within its own app', () => {
    const perms = [row('indexes', 'all', 'app-1')];
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-1' })).toBe(true);
    expect(checkPermission(perms, 'indexes', 'write', { appId: 'app-2' })).toBe(false);
  });

  it('a resource named literally "all" but scoped to an app is NOT the platform all:all wildcard', () => {
    const perms = [row('all', 'all', 'app-1')];
    expect(checkPermission(perms, 'tool', 'read')).toBe(false);
    expect(hasAllAllPermission(perms)).toBe(false);
  });

  it('combines multiple rows correctly (role holding several grants)', () => {
    const perms = [row('tool', 'read'), row('credential', 'all'), row('indexes', 'read', 'app-1')];
    expect(checkPermission(perms, 'tool', 'read')).toBe(true);
    expect(checkPermission(perms, 'tool', 'write')).toBe(false);
    expect(checkPermission(perms, 'credential', 'delete')).toBe(true);
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-1' })).toBe(true);
    expect(checkPermission(perms, 'indexes', 'read', { appId: 'app-2' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasAllAllPermission
// ---------------------------------------------------------------------------

describe('hasAllAllPermission', () => {
  it('true only for a platform-scoped all:all row', () => {
    expect(hasAllAllPermission([row('all', 'all')])).toBe(true);
    expect(hasAllAllPermission([row('all', 'read')])).toBe(false);
    expect(hasAllAllPermission([row('tool', 'all')])).toBe(false);
    expect(hasAllAllPermission([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// snapshotGrants — isPlatformAdmin / wildcards.allAll short-circuits
// ---------------------------------------------------------------------------

describe('snapshotGrants', () => {
  const baseSnapshot: PermissionSnapshot = {
    permissions: [],
    wildcards: { allAll: false, resources: [] },
    isPlatformAdmin: false,
  };

  it('platform admins bypass every check regardless of permission rows', () => {
    const snapshot: PermissionSnapshot = { ...baseSnapshot, isPlatformAdmin: true };
    expect(snapshotGrants(snapshot, 'anything', 'whatever')).toBe(true);
    expect(snapshotGrants(snapshot, 'indexes', 'write', { appId: 'app-1' })).toBe(true);
  });

  it('wildcards.allAll bypasses every check without needing the raw all:all row', () => {
    const snapshot: PermissionSnapshot = { ...baseSnapshot, wildcards: { allAll: true, resources: [] } };
    expect(snapshotGrants(snapshot, 'anything', 'whatever')).toBe(true);
  });

  it('falls through to checkPermission for a non-admin, non-wildcard snapshot', () => {
    const snapshot: PermissionSnapshot = { ...baseSnapshot, permissions: [row('tool', 'read')] };
    expect(snapshotGrants(snapshot, 'tool', 'read')).toBe(true);
    expect(snapshotGrants(snapshot, 'tool', 'write')).toBe(false);
  });

  it('denies everything for the EMPTY_PERMISSION_SNAPSHOT constant', () => {
    expect(snapshotGrants(EMPTY_PERMISSION_SNAPSHOT, 'tool', 'read')).toBe(false);
    expect(snapshotGrants(EMPTY_PERMISSION_SNAPSHOT, 'all', 'all')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// usePermissionStore — the synchronous store the SDK host runtime reads
// ---------------------------------------------------------------------------

describe('usePermissionStore', () => {
  it('fails closed when no snapshot has been set yet', () => {
    expect(usePermissionStore.getState().hasPermission('tool', 'read')).toBe(false);
    expect(usePermissionStore.getState().list()).toEqual([]);
  });

  it('grants per setSnapshot, and list() returns the flat permission array', () => {
    const snapshot: PermissionSnapshot = {
      permissions: [row('tool', 'read'), row('indexes', 'write', 'app-1')],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: false,
    };
    usePermissionStore.getState().setSnapshot(snapshot);

    expect(usePermissionStore.getState().hasPermission('tool', 'read')).toBe(true);
    expect(usePermissionStore.getState().hasPermission('tool', 'write')).toBe(false);
    expect(usePermissionStore.getState().hasPermission('indexes', 'write', { appId: 'app-1' })).toBe(true);
    expect(usePermissionStore.getState().list()).toEqual(snapshot.permissions);
  });

  it('clear() resets to the fail-closed state (e.g. on logout)', () => {
    usePermissionStore.getState().setSnapshot({
      permissions: [row('all', 'all')],
      wildcards: { allAll: true, resources: [] },
      isPlatformAdmin: false,
    });
    expect(usePermissionStore.getState().hasPermission('tool', 'read')).toBe(true);

    usePermissionStore.getState().clear();
    expect(usePermissionStore.getState().hasPermission('tool', 'read')).toBe(false);
    expect(usePermissionStore.getState().list()).toEqual([]);
  });

  it('isPlatformAdmin in the snapshot bypasses every check via the store too', () => {
    usePermissionStore.getState().setSnapshot({
      permissions: [],
      wildcards: { allAll: false, resources: [] },
      isPlatformAdmin: true,
    });
    expect(usePermissionStore.getState().hasPermission('anything', 'whatever')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-session cache helpers
// ---------------------------------------------------------------------------

describe('permission snapshot cache', () => {
  const snapshot: PermissionSnapshot = {
    permissions: [row('tool', 'read')],
    wildcards: { allAll: false, resources: [] },
    isPlatformAdmin: false,
  };

  it('returns null when nothing is cached', () => {
    expect(readCachedPermissionSnapshot()).toBeNull();
  });

  it('round-trips a written snapshot through localStorage when a token lives there', () => {
    localStorage.setItem('token', 'tok');
    writeCachedPermissionSnapshot(snapshot);
    expect(localStorage.getItem(PERMISSION_CACHE_KEY)).toBeTruthy();
    expect(readCachedPermissionSnapshot()).toEqual(snapshot);
  });

  it('falls back to sessionStorage when no localStorage token is present (rememberMe=false)', () => {
    // Note: the jsdom test setup backs localStorage/sessionStorage with the
    // same in-memory store (see src/tests/setup.ts), so this only exercises
    // the "no localStorage token" branch of the storage choice, not real
    // storage isolation (covered end-to-end by the browser).
    writeCachedPermissionSnapshot(snapshot);
    expect(sessionStorage.getItem(PERMISSION_CACHE_KEY)).toBeTruthy();
  });

  it('ignores malformed cached JSON rather than throwing', () => {
    localStorage.setItem(PERMISSION_CACHE_KEY, '{not json');
    expect(readCachedPermissionSnapshot()).toBeNull();
  });

  it('ignores a cached value missing the expected shape', () => {
    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify({ foo: 'bar' }));
    expect(readCachedPermissionSnapshot()).toBeNull();
  });

  it('clearCachedPermissionSnapshot removes it from both storages', () => {
    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(snapshot));
    sessionStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(snapshot));
    clearCachedPermissionSnapshot();
    expect(localStorage.getItem(PERMISSION_CACHE_KEY)).toBeNull();
    expect(sessionStorage.getItem(PERMISSION_CACHE_KEY)).toBeNull();
  });
});

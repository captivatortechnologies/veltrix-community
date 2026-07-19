// ========================================================================
// usePermissions — the client's single permission-checking hook (C1, Wave C
// RBAC/IdP hardening 2026-07-10). Fetches GET /api/me/permissions via
// react-query (fired on every mount where the caller is authenticated —
// since every login flow ends in a full-page reload, this covers both "after
// login" and "on app boot"), and keeps `usePermissionStore` (permissionStore.ts)
// in sync so non-React consumers (the SDK host runtime) can call
// `hasPermission` synchronously outside a component.
//
// "Instant availability" (design decision 5): a resolved snapshot is cached
// in storage (mirrors wherever the auth token lives) and used as react-query
// `initialData`, so a remount within the same session renders with the last-
// known permissions immediately instead of flashing fail-closed for one
// network round trip. The very first fetch of a fresh session still starts
// fail-closed until it resolves, by design.
// ========================================================================

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchMyPermissions } from '../services/permissionService';
import { isAuthenticated } from '../services/authService';
import {
  usePermissionStore,
  snapshotGrants,
  EMPTY_PERMISSION_SNAPSHOT,
  readCachedPermissionSnapshot,
  writeCachedPermissionSnapshot,
  type PermissionSnapshot,
  type PermissionEntry,
  type PermissionCheckOptions,
  type PermissionWildcards,
} from '../stores/permissionStore';

export const PERMISSIONS_QUERY_KEY = ['me', 'permissions'] as const;

export interface UsePermissionsResult {
  /** Fail-closed: `false` for anything not explicitly granted. */
  hasPermission: (resource: string, action: string, opts?: PermissionCheckOptions) => boolean;
  permissions: PermissionEntry[];
  wildcards: PermissionWildcards;
  isPlatformAdmin: boolean;
  /** True while the very first fetch of this session is in flight (no cached data yet). */
  isLoading: boolean;
  isFetched: boolean;
  isError: boolean;
  refetch: UseQueryResult<PermissionSnapshot>['refetch'];
}

/**
 * The client's mirror of the server's permission resolver. See
 * `stores/permissionStore.ts` for the matching semantics (kept in exact
 * lockstep with `server/src/lib/permissions.ts`).
 */
export function usePermissions(): UsePermissionsResult {
  const authed = isAuthenticated();
  const setSnapshot = usePermissionStore((state) => state.setSnapshot);
  const clear = usePermissionStore((state) => state.clear);

  const query = useQuery<PermissionSnapshot>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: fetchMyPermissions,
    enabled: authed,
    // RBAC changes are infrequent; matches the app-wide default (see
    // lib/queryClient.tsx) — set explicitly here since correctness (not just
    // freshness) depends on it staying fail-closed-safe.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    initialData: () => readCachedPermissionSnapshot() ?? undefined,
  });

  // Keep the zustand store (the SDK host runtime's synchronous read path)
  // and the cross-session cache in sync with the latest resolved snapshot.
  useEffect(() => {
    if (query.data) {
      setSnapshot(query.data);
      writeCachedPermissionSnapshot(query.data);
    }
  }, [query.data, setSnapshot]);

  // Signed out (or session expired) -> fail closed immediately, don't keep
  // serving a previous tenant's/user's cached grants.
  useEffect(() => {
    if (!authed) clear();
  }, [authed, clear]);

  const snapshot = query.data ?? EMPTY_PERMISSION_SNAPSHOT;

  const hasPermission = useCallback(
    (resource: string, action: string, opts?: PermissionCheckOptions) =>
      authed ? snapshotGrants(snapshot, resource, action, opts) : false,
    [authed, snapshot],
  );

  return useMemo(
    () => ({
      hasPermission,
      permissions: snapshot.permissions,
      wildcards: snapshot.wildcards,
      isPlatformAdmin: snapshot.isPlatformAdmin,
      isLoading: authed && query.isLoading,
      isFetched: query.isFetched,
      isError: query.isError,
      refetch: query.refetch,
    }),
    [hasPermission, snapshot, authed, query.isLoading, query.isFetched, query.isError, query.refetch],
  );
}

export default usePermissions;

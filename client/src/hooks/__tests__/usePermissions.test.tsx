// ========================================================================
// Tests: usePermissions — react-query fetch of GET /api/me/permissions,
// zustand store sync, cross-session cache hydration, and fail-closed
// behavior while signed out / loading.
// ========================================================================

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePermissions } from '../usePermissions';
import { fetchMyPermissions } from '../../services/permissionService';
import * as authService from '../../services/authService';
import {
  usePermissionStore,
  PERMISSION_CACHE_KEY,
  type PermissionSnapshot,
} from '../../stores/permissionStore';

vi.mock('../../services/permissionService', () => ({
  fetchMyPermissions: vi.fn(),
}));

const mockFetchMyPermissions = fetchMyPermissions as unknown as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const allAllSnapshot: PermissionSnapshot = {
  permissions: [{ resource: 'all', action: 'all', appId: null }],
  wildcards: { allAll: true, resources: [] },
  isPlatformAdmin: false,
};

const scopedSnapshot: PermissionSnapshot = {
  permissions: [{ resource: 'tool', action: 'read', appId: null }],
  wildcards: { allAll: false, resources: [] },
  isPlatformAdmin: false,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  usePermissionStore.setState({ snapshot: null });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePermissions', () => {
  it('is fail-closed and does not fetch when the caller is not authenticated', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(false);

    const { result } = renderHook(() => usePermissions(), { wrapper });

    expect(result.current.hasPermission('tool', 'read')).toBe(false);
    expect(result.current.isPlatformAdmin).toBe(false);
    expect(mockFetchMyPermissions).not.toHaveBeenCalled();
  });

  it('fetches the snapshot when authenticated and resolves hasPermission once loaded', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    mockFetchMyPermissions.mockResolvedValue(scopedSnapshot);

    const { result } = renderHook(() => usePermissions(), { wrapper });

    // Fail-closed while the first fetch of the session is still in flight.
    expect(result.current.hasPermission('tool', 'read')).toBe(false);

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.hasPermission('tool', 'read')).toBe(true);
    expect(result.current.hasPermission('tool', 'write')).toBe(false);
  });

  it('platform-admin / all:all snapshots grant every check once loaded', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    mockFetchMyPermissions.mockResolvedValue(allAllSnapshot);

    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.hasPermission('anything', 'whatever')).toBe(true);
    expect(result.current.wildcards.allAll).toBe(true);
  });

  it('syncs the zustand store so non-React consumers (the SDK host runtime) see the same result', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    mockFetchMyPermissions.mockResolvedValue(scopedSnapshot);

    renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => expect(usePermissionStore.getState().hasPermission('tool', 'read')).toBe(true));
  });

  it('writes the resolved snapshot to the cross-session cache for instant availability on the next mount', async () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    mockFetchMyPermissions.mockResolvedValue(scopedSnapshot);
    localStorage.setItem('token', 'tok');

    renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => expect(localStorage.getItem(PERMISSION_CACHE_KEY)).toBeTruthy());
    expect(JSON.parse(localStorage.getItem(PERMISSION_CACHE_KEY)!)).toEqual(scopedSnapshot);
  });

  it('hydrates instantly from the cache on mount (no fail-closed flash) when a prior snapshot is cached', () => {
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(true);
    localStorage.setItem('token', 'tok');
    localStorage.setItem(PERMISSION_CACHE_KEY, JSON.stringify(allAllSnapshot));
    mockFetchMyPermissions.mockResolvedValue(allAllSnapshot);

    const { result } = renderHook(() => usePermissions(), { wrapper });

    // Synchronously true on first render, before the network fetch resolves.
    expect(result.current.hasPermission('anything', 'whatever')).toBe(true);
  });

  it('clears the store when the caller is not authenticated (e.g. after logout)', () => {
    usePermissionStore.getState().setSnapshot(allAllSnapshot);
    vi.spyOn(authService, 'isAuthenticated').mockReturnValue(false);

    renderHook(() => usePermissions(), { wrapper });

    expect(usePermissionStore.getState().hasPermission('anything', 'whatever')).toBe(false);
  });
});

// ========================================================================
// Permission service — thin transport for GET /api/me/permissions (R1,
// RBAC/IdP hardening 2026-07-10). The previous version of this file called
// endpoints (`/api/permissions`, tool-scoped roles) that were never wired up
// server-side — replaced entirely by the real contract.
//
// Consume this via `usePermissions()` (src/hooks/usePermissions.ts), not
// directly — that hook owns caching (react-query), the cross-session cache,
// and syncing the zustand store the SDK host runtime reads synchronously.
// ========================================================================

import { api } from '../lib/apiClient';
import type { PermissionSnapshot } from '../stores/permissionStore';

/** Fetch the signed-in user's resolved permission snapshot. */
export async function fetchMyPermissions(): Promise<PermissionSnapshot> {
  const response = await api.get<PermissionSnapshot>('/me/permissions');
  return response.data;
}

export default { fetchMyPermissions };

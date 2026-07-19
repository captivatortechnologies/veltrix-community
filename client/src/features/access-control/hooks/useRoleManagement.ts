// ========================================================================
// react-query hooks for the RoleManagement feature (C3, Wave C RBAC/IdP
// hardening 2026-07-10). Roles + the live resource catalog (R4 — enforced
// platform resources plus each installed app's declared permissions and
// configuration types).
// ========================================================================

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
  getRoles,
  getResources,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type CatalogResource,
  type PermissionInput,
} from '../../../services/roleService';

export const roleManagementKeys = {
  all: ['roleManagement'] as const,
  roles: () => [...roleManagementKeys.all, 'roles'] as const,
  resources: () => [...roleManagementKeys.all, 'resources'] as const,
};

export function useRoles(options?: Partial<UseQueryOptions<Role[], Error>>) {
  return useQuery<Role[], Error>({
    queryKey: roleManagementKeys.roles(),
    queryFn: getRoles,
    ...options,
  });
}

/** The live resource catalog — platform resources + per-installed-app sections. */
export function useResourceCatalog(options?: Partial<UseQueryOptions<CatalogResource[], Error>>) {
  return useQuery<CatalogResource[], Error>({
    queryKey: roleManagementKeys.resources(),
    queryFn: getResources,
    // The catalog only changes when an app is installed/enabled/disabled —
    // safe to treat as fairly static within a session.
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export interface RoleFormValues {
  name: string;
  description?: string;
  permissions: PermissionInput[];
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, RoleFormValues>({
    mutationFn: (values) => createRole(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleManagementKeys.roles() });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, { roleId: string; values: RoleFormValues }>({
    mutationFn: ({ roleId, values }) => updateRole(roleId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleManagementKeys.roles() });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (roleId) => deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleManagementKeys.roles() });
    },
  });
}

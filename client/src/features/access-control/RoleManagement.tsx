import React, { useMemo, useState } from 'react';
import { Plus, Edit2, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '../../components/shared/Button';
import { Badge } from '../../components/shared/Badge';
import { EmptyState } from '../../components/shared/EmptyState';
import { SkeletonCard } from '../../components/shared/Skeleton';
import { useToast } from '../../components/shared/Toast';
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog';
import type { Role } from '../../services/roleService';
import { useRoles, useResourceCatalog, useDeleteRole } from './hooks/useRoleManagement';
import { hasAllAllSelected } from './permissionSelection';
import { RoleFormDialog } from './components/RoleFormDialog';
import { RoleDetailModal } from './components/RoleDetailModal';

/** appId -> app display name, derived from the live catalog. */
function buildAppNameLookup(catalog: ReturnType<typeof useResourceCatalog>['data']): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of catalog ?? []) {
    if (entry.appId && entry.appName) lookup.set(entry.appId, entry.appName);
  }
  return lookup;
}

/** Human-readable permission summary badges for a role card. */
function summarizeRole(role: Role, appNames: Map<string, string>): string[] {
  const permissions = role.permissions ?? [];
  if (permissions.length === 0) return [];
  if (hasAllAllSelected(permissions)) return ['Full platform access'];

  const platformCount = permissions.filter((p) => p.appId === null).length;
  const summaries: string[] = [];
  if (platformCount > 0) {
    summaries.push(`${platformCount} platform permission${platformCount !== 1 ? 's' : ''}`);
  }

  const byApp = new Map<string, number>();
  for (const p of permissions) {
    if (!p.appId) continue;
    byApp.set(p.appId, (byApp.get(p.appId) ?? 0) + 1);
  }
  for (const [appId, count] of byApp) {
    const appName = appNames.get(appId) ?? appId;
    summaries.push(`${appName}: ${count} permission${count !== 1 ? 's' : ''}`);
  }

  return summaries;
}

/**
 * Role Management — the RBAC role editor (C3, Wave C RBAC/IdP hardening
 * 2026-07-10). Consumes the live resource catalog (R4): every enforced
 * platform resource, plus each installed app's declared permissions and
 * configuration types, rendered grouped (platform matrix, then one
 * collapsible section per app) in RoleFormDialog.
 */
const RoleManagement: React.FC = () => {
  const { data: roles = [], isLoading: rolesLoading, isError: rolesError, error: rolesErrorObj } = useRoles();
  const { data: catalog = [], isLoading: catalogLoading } = useResourceCatalog();
  const deleteRole = useDeleteRole();
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [detailRole, setDetailRole] = useState<Role | null>(null);

  const appNames = useMemo(() => buildAppNameLookup(catalog), [catalog]);

  const openCreateDialog = () => {
    setEditingRole(null);
    setDialogOpen(true);
  };

  const openEditDialog = (role: Role) => {
    setEditingRole(role);
    setDialogOpen(true);
  };

  const handleSaved = (message: string) => {
    toast.success(message);
  };

  const handleDelete = async (role: Role) => {
    const confirmed = await confirm({
      title: 'Delete role',
      message: `Delete the role "${role.name}"? This cannot be undone, and will fail if any user still has this role assigned.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteRole.mutateAsync(role.id);
      toast.success(`Role "${role.name}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete role.');
    }
  };

  const loading = rolesLoading || catalogLoading;

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-content-primary">Roles</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Grant platform resources and installed apps' own permissions to each role.
          </p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreateDialog}>
          Add role
        </Button>
      </div>

      {rolesError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-danger-subtle-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">{rolesErrorObj instanceof Error ? rolesErrorObj.message : 'Failed to load roles'}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading roles">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={40} aria-hidden="true" />}
          title="No roles found"
          description="Create a role to control what users can see and do."
          action={
            <Button variant="primary" onClick={openCreateDialog}>
              Add role
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {roles.map((role) => {
            const summaries = summarizeRole(role, appNames);
            return (
              <div
                key={role.id}
                role="button"
                tabIndex={0}
                aria-label={`View details for role ${role.name}`}
                onClick={() => setDetailRole(role)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailRole(role);
                  }
                }}
                className="cursor-pointer rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-medium text-content-primary">{role.name}</h3>
                    <p className="mt-0.5 text-sm text-content-secondary">
                      {role.description || 'No description'}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit role ${role.name}`}
                      onClick={() => openEditDialog(role)}
                    >
                      <Edit2 size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete role ${role.name}`}
                      onClick={() => handleDelete(role)}
                      isLoading={deleteRole.isPending && deleteRole.variables === role.id}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {summaries.length === 0 ? (
                    <span className="text-sm text-content-tertiary">No permissions</span>
                  ) : (
                    summaries.map((summary) => (
                      <Badge key={summary} variant={summary === 'Full platform access' ? 'primary' : 'secondary'}>
                        {summary}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RoleDetailModal
        role={detailRole}
        catalog={catalog}
        onClose={() => setDetailRole(null)}
        onEdit={(role) => {
          setDetailRole(null);
          openEditDialog(role);
        }}
        onDelete={(role) => {
          setDetailRole(null);
          void handleDelete(role);
        }}
        deleting={deleteRole.isPending && deleteRole.variables === detailRole?.id}
      />

      <RoleFormDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        role={editingRole}
        catalog={catalog}
        onSaved={handleSaved}
      />
    </div>
  );
};

export default RoleManagement;

import React, { useEffect, useMemo, useState } from 'react';
import { FormDialog } from '../../../components/shared/FormDialog';
import { Input } from '../../../components/shared/Input';
import { Textarea } from '../../../components/shared/Textarea';
import { Checkbox } from '../../../components/shared/Checkbox';
import type { CatalogResource, PermissionInput, Role } from '../../../services/roleService';
import { useCreateRole, useUpdateRole, type RoleFormValues } from '../hooks/useRoleManagement';
import { hasAllAllSelected, setAllAllSelected, togglePermission } from '../permissionSelection';
import { PermissionMatrixSection } from './PermissionMatrixSection';
import { AppPermissionSection } from './AppPermissionSection';

export interface RoleFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** `null` = create mode. */
  role: Role | null;
  catalog: CatalogResource[];
  onSaved: (message: string) => void;
}

/** appId -> { appName, resources } — one group per installed app declaring resources. */
interface AppGroup {
  appId: string;
  appName: string;
  resources: CatalogResource[];
}

function groupCatalog(catalog: CatalogResource[]): { platform: CatalogResource[]; apps: AppGroup[] } {
  const platform: CatalogResource[] = [];
  const appsByid = new Map<string, AppGroup>();

  for (const entry of catalog) {
    if (entry.appId === null) {
      platform.push(entry);
      continue;
    }
    const existing = appsByid.get(entry.appId);
    if (existing) {
      existing.resources.push(entry);
    } else {
      appsByid.set(entry.appId, { appId: entry.appId, appName: entry.appName ?? entry.appId, resources: [entry] });
    }
  }

  return { platform, apps: Array.from(appsByid.values()).sort((a, b) => a.appName.localeCompare(b.appName)) };
}

function toPermissionInputs(role: Role | null): PermissionInput[] {
  if (!role?.permissions) return [];
  return role.permissions.map((p) => ({ resource: p.resource, action: p.action, appId: p.appId }));
}

/**
 * Add/Edit role dialog: name + description, a "Full platform access"
 * shortcut for `all:all`, the platform resources matrix, and one
 * collapsible section per installed app declaring resources or
 * configuration types. Persists `appId` on app-scoped selections (design
 * decision 1) — see role.route.ts's create/update payload schemas.
 */
export const RoleFormDialog: React.FC<RoleFormDialogProps> = ({ isOpen, onClose, role, catalog, onSaved }) => {
  const isEditing = role !== null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<PermissionInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Captured ONCE when the dialog opens (not reactive to later edits) so an
  // app section the role already has grants in starts expanded, without
  // fighting the user's own manual collapse/expand afterwards.
  const [initiallyOpenApps, setInitiallyOpenApps] = useState<Set<string>>(new Set());

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const isSubmitting = createRole.isPending || updateRole.isPending;

  // Reset the form to the target role (or a blank create form) every time
  // the dialog opens, so stale state from a previous edit never leaks in.
  useEffect(() => {
    if (!isOpen) return;
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    const initialPermissions = toPermissionInputs(role);
    setPermissions(initialPermissions);
    setInitiallyOpenApps(
      new Set(initialPermissions.filter((p) => p.appId).map((p) => p.appId as string)),
    );
    setError(null);
  }, [isOpen, role]);

  const { platform, apps } = useMemo(() => groupCatalog(catalog), [catalog]);
  const fullAccess = hasAllAllSelected(permissions);

  const handleToggle = (resource: string, action: string, appId: string | null) => {
    setPermissions((prev) => togglePermission(prev, resource, action, appId));
  };

  const handleToggleFullAccess = () => {
    setPermissions((prev) => setAllAllSelected(prev, !fullAccess));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Role name is required.');
      return;
    }

    const values: RoleFormValues = {
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
    };

    try {
      if (isEditing) {
        await updateRole.mutateAsync({ roleId: role.id, values });
        onSaved(`Role "${values.name}" updated.`);
      } else {
        await createRole.mutateAsync(values);
        onSaved(`Role "${values.name}" created.`);
      }
      onClose();
    } catch (err) {
      // Surfaces RoleEscalationError's detailed 403 message ("Cannot grant
      // permission(s) you do not hold yourself: ...") or a name conflict,
      // not a generic failure — see roleService.ts's toServiceError.
      setError(err instanceof Error ? err.message : 'Failed to save role.');
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit role: ${role.name}` : 'Add role'}
      description="Grant platform resources and, for each installed app, its own declared permissions and configuration types."
      onSubmit={handleSubmit}
      submitText={isEditing ? 'Save changes' : 'Create role'}
      isSubmitting={isSubmitting}
      error={error}
      size="lg"
    >
      <Input
        label="Role name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Security Analyst"
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What this role is for"
        rows={2}
      />

      <div className="rounded-md border border-border bg-surface-hover px-4 py-3">
        <Checkbox
          label="Full platform access (all:all)"
          helperText="Grants every action on every resource, including every installed app. You can only grant this if you hold it yourself."
          checked={fullAccess}
          onChange={handleToggleFullAccess}
        />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-content-primary">Platform resources</h4>
        <PermissionMatrixSection
          resources={platform}
          selected={permissions}
          onToggle={handleToggle}
          disabled={fullAccess}
        />
      </div>

      {apps.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-content-primary">Installed apps</h4>
          <div className="space-y-2">
            {apps.map((app) => (
              <AppPermissionSection
                key={app.appId}
                appId={app.appId}
                appName={app.appName}
                resources={app.resources}
                selected={permissions}
                onToggle={handleToggle}
                disabled={fullAccess}
                defaultOpen={initiallyOpenApps.has(app.appId)}
              />
            ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
};

export default RoleFormDialog;

import React, { useMemo } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Badge } from '../../../components/shared/Badge';
import type { CatalogResource, Permission, Role } from '../../../services/roleService';
import { hasAllAllSelected } from '../permissionSelection';

export interface RoleDetailModalProps {
  /** The role to show. `null` keeps the modal closed. */
  role: Role | null;
  /** Live resource catalog, used to resolve appId -> app display name. */
  catalog: CatalogResource[];
  onClose: () => void;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  /** True while this role's delete is in flight. */
  deleting?: boolean;
}

interface PermissionGroup {
  key: string;
  label: string;
  /** resource -> sorted list of actions. */
  byResource: Map<string, string[]>;
}

/** Group a role's permissions into a platform bucket plus one bucket per app. */
function groupPermissions(permissions: Permission[], appNames: Map<string, string>): PermissionGroup[] {
  const groups = new Map<string, PermissionGroup>();
  for (const p of permissions) {
    const key = p.appId ?? '__platform__';
    const label = p.appId ? (appNames.get(p.appId) ?? p.appId) : 'Platform';
    let group = groups.get(key);
    if (!group) {
      group = { key, label, byResource: new Map() };
      groups.set(key, group);
    }
    const actions = group.byResource.get(p.resource) ?? [];
    if (!actions.includes(p.action)) actions.push(p.action);
    group.byResource.set(p.resource, actions);
  }
  // Platform first, then apps alphabetically.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === '__platform__') return -1;
    if (b.key === '__platform__') return 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Read-only details for a single RBAC role, opened by clicking a role card. Shows
 * the role's name, description, and its full permission grants grouped by scope
 * (platform, then per app), with Edit and Delete actions in the footer.
 */
export const RoleDetailModal: React.FC<RoleDetailModalProps> = ({
  role,
  catalog,
  onClose,
  onEdit,
  onDelete,
  deleting = false,
}) => {
  const appNames = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const entry of catalog) {
      if (entry.appId && entry.appName) lookup.set(entry.appId, entry.appName);
    }
    return lookup;
  }, [catalog]);

  const permissions = role?.permissions ?? [];
  const fullAccess = permissions.length > 0 && hasAllAllSelected(permissions);
  const groups = useMemo(
    () => (fullAccess ? [] : groupPermissions(permissions, appNames)),
    [fullAccess, permissions, appNames],
  );

  return (
    <Modal
      isOpen={role !== null}
      onClose={onClose}
      title={role?.name}
      subtitle={role?.description || 'No description'}
      size="lg"
      footer={
        role ? (
          <>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => onDelete(role)}
              isLoading={deleting}
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              leftIcon={<Edit2 size={16} aria-hidden="true" />}
              onClick={() => onEdit(role)}
            >
              Edit
            </Button>
          </>
        ) : null
      }
    >
      <div>
        <h4 className="text-sm font-semibold text-content-primary">Permissions</h4>
        {permissions.length === 0 ? (
          <p className="mt-2 text-sm text-content-tertiary">This role grants no permissions.</p>
        ) : fullAccess ? (
          <div className="mt-2">
            <Badge variant="primary">Full platform access</Badge>
            <p className="mt-2 text-sm text-content-secondary">
              This role grants every action on every resource across the platform and all installed apps.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {groups.map((group) => (
              <div key={group.key} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                  {group.label}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {Array.from(group.byResource.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([resource, actions]) => (
                      <li key={resource} className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-medium text-content-primary">{resource}</span>
                        <span className="text-content-tertiary">·</span>
                        {actions
                          .slice()
                          .sort()
                          .map((action) => (
                            <Badge key={action} variant="secondary">
                              {action}
                            </Badge>
                          ))}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default RoleDetailModal;

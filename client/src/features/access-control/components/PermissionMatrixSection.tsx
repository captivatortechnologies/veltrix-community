import React from 'react';
import { Checkbox } from '../../../components/shared/Checkbox';
import type { CatalogResource, PermissionInput } from '../../../services/roleService';
import { formatActionLabel, formatResourceLabel, isPermissionSelected } from '../permissionSelection';

export interface PermissionMatrixSectionProps {
  resources: CatalogResource[];
  selected: PermissionInput[];
  onToggle: (resource: string, action: string, appId: string | null) => void;
  disabled?: boolean;
  /** Shown when `resources` is empty (e.g. an app that declares no permissions or config types). */
  emptyMessage?: string;
}

/**
 * One resource-per-row permission checklist: resource name + description on
 * the left, a checkbox per declared action on the right. Actions vary per
 * resource (e.g. `subscription` is read-only), so this deliberately renders
 * rows rather than a fixed-column table.
 */
export const PermissionMatrixSection: React.FC<PermissionMatrixSectionProps> = ({
  resources,
  selected,
  onToggle,
  disabled = false,
  emptyMessage = 'No permissions declared.',
}) => {
  if (resources.length === 0) {
    return <p className="px-4 py-3 text-sm text-content-tertiary">{emptyMessage}</p>;
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {resources.map((resource) => (
        <div
          key={`${resource.appId ?? 'platform'}:${resource.resource}`}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 sm:max-w-[45%]">
            <p className="text-sm font-medium text-content-primary">{formatResourceLabel(resource.resource)}</p>
            {resource.description && (
              <p className="mt-0.5 text-xs text-content-secondary">{resource.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {resource.actions.map((action) => (
              <Checkbox
                key={action}
                label={formatActionLabel(action)}
                checked={isPermissionSelected(selected, resource.resource, action, resource.appId)}
                onChange={() => onToggle(resource.resource, action, resource.appId)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PermissionMatrixSection;

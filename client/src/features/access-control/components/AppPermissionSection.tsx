import React from 'react';
import { Badge } from '../../../components/shared/Badge';
import type { CatalogResource, PermissionInput } from '../../../services/roleService';
import { countForScope } from '../permissionSelection';
import { PermissionMatrixSection } from './PermissionMatrixSection';

export interface AppPermissionSectionProps {
  appId: string;
  appName: string;
  resources: CatalogResource[];
  selected: PermissionInput[];
  onToggle: (resource: string, action: string, appId: string | null) => void;
  disabled?: boolean;
  /** Expanded by default the first time a role being edited already has grants in this app. */
  defaultOpen?: boolean;
}

/**
 * One collapsible, per-app permission matrix section (C3 — "one collapsible
 * section per app (app name header) with its resource×action matrix").
 * Uses a native `<details>`/`<summary>` disclosure: keyboard-operable and
 * screen-reader friendly for free, without a bespoke accordion component for
 * what is — for now — the matrix's only collapsible-section use case.
 */
export const AppPermissionSection: React.FC<AppPermissionSectionProps> = ({
  appId,
  appName,
  resources,
  selected,
  onToggle,
  disabled = false,
  defaultOpen = false,
}) => {
  const selectedCount = countForScope(selected, appId);

  return (
    <details className="group rounded-md border border-border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 py-3 marker:content-none hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex items-center gap-2 text-sm font-semibold text-content-primary">
          <svg
            className="h-4 w-4 shrink-0 text-content-tertiary transition-transform group-open:rotate-90"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {appName}
        </span>
        {selectedCount > 0 && (
          <Badge variant="primary" size="sm">
            {selectedCount} permission{selectedCount !== 1 ? 's' : ''}
          </Badge>
        )}
      </summary>
      <div className="border-t border-border p-3">
        <PermissionMatrixSection
          resources={resources}
          selected={selected}
          onToggle={onToggle}
          disabled={disabled}
          emptyMessage="This app declares no permissions or configuration types."
        />
      </div>
    </details>
  );
};

export default AppPermissionSection;

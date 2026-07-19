/**
 * Version Control Component Types
 * Shared types for version control, history tracking, and diff viewing
 */

import type React from 'react';

// ============================================================================
// Enums & Constants
// ============================================================================

export type ConfigActionType =
  | 'CREATED'
  | 'UPDATED'
  | 'DELETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'DEPLOYED'
  | 'REVERTED';

export type DeployState =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'deployed'
  | 'draft';

export type DiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export type DiffViewMode = 'side-by-side' | 'inline' | 'unified';

/**
 * Custom diff tab that can be injected into DiffViewer.
 * Allows domain-specific diff views (e.g. Splunk .conf syntax)
 * without coupling the shared component to product logic.
 */
export interface CustomDiffTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  render: (
    oldValue: Record<string, unknown> | string | null,
    newValue: Record<string, unknown> | string | null
  ) => React.ReactNode;
  /** Return false to hide this tab for the given data (e.g. no conf sections) */
  shouldShow?: (
    oldValue: Record<string, unknown> | string | null,
    newValue: Record<string, unknown> | string | null
  ) => boolean;
}

// ============================================================================
// Core Entities
// ============================================================================

export interface VersionUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface VersionDetails {
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changedFields?: string[];
  message?: string;
}

export interface VersionEntry {
  id: string;
  timestamp: string;
  action: ConfigActionType;
  entityType: string;
  entityId: string;
  entityName?: string;
  deployState?: DeployState;
  details: VersionDetails;
  user: VersionUser;
  customerId: string;
}

// ============================================================================
// Diff Types
// ============================================================================

export interface DiffChange {
  field: string;
  path: string[];
  oldValue: unknown;
  newValue: unknown;
  type: DiffChangeType;
  children?: DiffChange[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface VersionDiff {
  fromVersion: VersionEntry;
  toVersion: VersionEntry;
  changes: DiffChange[];
  summary: DiffSummary;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface VersionFilters {
  action?: ConfigActionType[];
  entityType?: string[];
  entityId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  deployState?: DeployState[];
  searchTerm?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Component Props
// ============================================================================

export interface VersionControlPanelProps {
  entityType: string;
  entityId?: string;
  title?: string;
  showApprovals?: boolean;
  showTimeline?: boolean;
  showFilters?: boolean;
  showCompare?: boolean;
  showExport?: boolean;
  defaultTab?: 'history' | 'approvals';
  maxHeight?: string;
  onEntryClick?: (entry: VersionEntry) => void;
  onApprove?: (entry: VersionEntry) => void | Promise<void>;
  onReject?: (entry: VersionEntry, reason?: string) => void | Promise<void>;
  onRevert?: (entry: VersionEntry) => void | Promise<void>;
  className?: string;
  /** Custom diff view tabs passed to DiffViewer in modals */
  customDiffTabs?: CustomDiffTab[];
  /** Default diff view tab id for DiffViewer */
  defaultDiffView?: string;
}

export interface DiffViewerProps {
  oldValue: Record<string, unknown> | string | null;
  newValue: Record<string, unknown> | string | null;
  title?: string;
  mode?: DiffViewMode;
  showLineNumbers?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  maxHeight?: string;
  className?: string;
  /** Custom diff view tabs injected by domain-specific features */
  customDiffTabs?: CustomDiffTab[];
  /** Default diff view tab id (defaults to 'fields') */
  defaultDiffView?: string;
}

export interface VersionTimelineProps {
  entries: VersionEntry[];
  isLoading?: boolean;
  selectedEntryId?: string;
  showUserAvatar?: boolean;
  showEntityInfo?: boolean;
  onEntryClick?: (entry: VersionEntry) => void;
  onCompare?: (entry1: VersionEntry, entry2: VersionEntry) => void;
  className?: string;
}

export interface VersionTimelineItemProps {
  entry: VersionEntry;
  isSelected?: boolean;
  isCompareMode?: boolean;
  showUserAvatar?: boolean;
  showEntityInfo?: boolean;
  onClick?: () => void;
  onCompareSelect?: () => void;
}

export interface PendingApprovalsProps {
  entries: VersionEntry[];
  isLoading?: boolean;
  onApprove?: (id: string) => void | Promise<void>;
  onReject?: (id: string, reason?: string) => void | Promise<void>;
  onViewDetails?: (entry: VersionEntry) => void;
  className?: string;
}

export interface ApprovalCardProps {
  entry: VersionEntry;
  onApprove?: () => void | Promise<void>;
  onReject?: (reason?: string) => void | Promise<void>;
  onViewDetails?: () => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export interface VersionDetailModalProps {
  entry: VersionEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onRevert?: (versionId: string) => void | Promise<void>;
  onCompare?: (entry: VersionEntry) => void;
  onApprove?: (entryId: string, comment?: string) => void | Promise<void>;
  onReject?: (entryId: string, reason?: string) => void | Promise<void>;
  customDiffTabs?: CustomDiffTab[];
  defaultDiffView?: string;
}

export interface VersionCompareModalProps {
  fromVersion: VersionEntry | null;
  toVersion: VersionEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSwapVersions?: () => void;
  customDiffTabs?: CustomDiffTab[];
  defaultDiffView?: string;
}

export interface VersionFiltersProps {
  filters: VersionFilters;
  onFiltersChange: (filters: VersionFilters) => void;
  availableEntityTypes?: string[];
  availableUsers?: VersionUser[];
  className?: string;
}

export interface VersionActionsProps {
  entry: VersionEntry;
  onRevert?: () => void | Promise<void>;
  onCompare?: () => void;
  onExport?: () => void;
  onViewDetails?: () => void;
  isReverting?: boolean;
  showRevert?: boolean;
  showCompare?: boolean;
  showExport?: boolean;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseVersionControlReturn {
  history: VersionEntry[];
  pendingApprovals: VersionEntry[];
  isLoading: boolean;
  error: Error | null;
  filters: VersionFilters;
  setFilters: (filters: VersionFilters) => void;
  pagination: PaginationParams;
  setPagination: (params: PaginationParams) => void;
  totalEntries: number;
  refetch: () => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason?: string) => Promise<void>;
  revert: (versionId: string) => Promise<void>;
}

export interface UseVersionDiffReturn {
  diff: VersionDiff | null;
  isComputing: boolean;
  error: Error | null;
  computeDiff: (from: VersionEntry, to: VersionEntry) => void;
  clearDiff: () => void;
}

export interface UseVersionFiltersReturn {
  filters: VersionFilters;
  setFilters: (filters: VersionFilters) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface VersionControlApiParams {
  entityType: string;
  entityId?: string;
  filters?: VersionFilters;
  pagination?: PaginationParams;
}

export interface ApproveRejectPayload {
  versionId: string;
  reason?: string;
}

export interface RevertPayload {
  versionId: string;
  entityType: string;
  entityId: string;
}

export interface ComparePayload {
  fromVersionId: string;
  toVersionId: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type ActionColorMap = {
  [key in ConfigActionType]: {
    bg: string;
    text: string;
    darkBg: string;
    darkText: string;
    icon: string;
  };
};

export type DeployStateColorMap = {
  [key in DeployState]: {
    bg: string;
    text: string;
    darkBg: string;
    darkText: string;
    icon: string;
  };
};

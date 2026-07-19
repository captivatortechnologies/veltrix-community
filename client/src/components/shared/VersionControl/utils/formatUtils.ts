/**
 * Format Utilities
 * Date, time, and display formatting helpers for version control
 */

import type {
  ConfigActionType,
  DeployState,
  ActionColorMap,
  DeployStateColorMap,
  VersionEntry,
  VersionUser,
} from '../types';

// ============================================================================
// Date & Time Formatting
// ============================================================================

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: string | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  if (diffWeek < 4) return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;
  return `${diffYear} year${diffYear === 1 ? '' : 's'} ago`;
}

/**
 * Format date for filter inputs
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ============================================================================
// User Formatting
// ============================================================================

/**
 * Get user initials for avatar
 */
export function getUserInitials(user: VersionUser): string {
  if (!user.name) return user.email.charAt(0).toUpperCase();
  const parts = user.name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Get display name for user
 */
export function getUserDisplayName(user: VersionUser): string {
  return user.name || user.email.split('@')[0];
}

/**
 * Generate a consistent color for user avatar based on email
 */
export function getUserAvatarColor(email: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ============================================================================
// Action & State Formatting
// ============================================================================

/**
 * Get human-readable label for action type
 */
export function getActionLabel(action: ConfigActionType): string {
  const labels: Record<ConfigActionType, string> = {
    CREATED: 'Created',
    UPDATED: 'Updated',
    DELETED: 'Deleted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    DEPLOYED: 'Deployed',
    REVERTED: 'Reverted',
  };
  return labels[action] || action;
}

/**
 * Get human-readable label for deploy state
 * Handles both underscore and space formats (e.g., 'pending_approval' and 'pending approval')
 */
export function getDeployStateLabel(state: DeployState | string | undefined): string {
  if (!state) return 'Draft';

  const labels: Record<DeployState, string> = {
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    deployed: 'Deployed',
    draft: 'Draft',
  };

  // Normalize the state to handle space vs underscore differences
  const normalizedState = state.replace(/\s+/g, '_') as DeployState;
  return labels[normalizedState] || state;
}

/**
 * Color mappings for action types
 */
export const actionColors: ActionColorMap = {
  CREATED: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    darkBg: 'dark:bg-green-900/30',
    darkText: 'dark:text-green-300',
    icon: 'text-green-600 dark:text-green-400',
  },
  UPDATED: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  DELETED: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    darkBg: 'dark:bg-red-900/30',
    darkText: 'dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
  },
  APPROVED: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    darkBg: 'dark:bg-emerald-900/30',
    darkText: 'dark:text-emerald-300',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  REJECTED: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    darkBg: 'dark:bg-orange-900/30',
    darkText: 'dark:text-orange-300',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  DEPLOYED: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    darkBg: 'dark:bg-purple-900/30',
    darkText: 'dark:text-purple-300',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  REVERTED: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    darkBg: 'dark:bg-yellow-900/30',
    darkText: 'dark:text-yellow-300',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
};

/**
 * Color mappings for deploy states
 */
export const deployStateColors: DeployStateColorMap = {
  pending_approval: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    darkBg: 'dark:bg-yellow-900/30',
    darkText: 'dark:text-yellow-300',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  approved: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    darkBg: 'dark:bg-green-900/30',
    darkText: 'dark:text-green-300',
    icon: 'text-green-600 dark:text-green-400',
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    darkBg: 'dark:bg-red-900/30',
    darkText: 'dark:text-red-300',
    icon: 'text-red-600 dark:text-red-400',
  },
  deployed: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    darkBg: 'dark:bg-gray-900/30',
    darkText: 'dark:text-gray-300',
    icon: 'text-gray-600 dark:text-gray-400',
  },
};

/**
 * Get color classes for an action
 */
export function getActionColorClasses(action: ConfigActionType): string {
  const colors = actionColors[action];
  return `${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`;
}

/**
 * Get color classes for a deploy state
 * Handles both underscore and space formats (e.g., 'pending_approval' and 'pending approval')
 */
export function getDeployStateColorClasses(state: DeployState | string | undefined): string {
  if (!state) {
    // Default to draft styling for undefined/null states
    const colors = deployStateColors.draft;
    return `${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`;
  }

  // Normalize the state to handle space vs underscore differences
  const normalizedState = state.replace(/\s+/g, '_') as DeployState;
  const colors = deployStateColors[normalizedState] || deployStateColors.draft;
  return `${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`;
}

// ============================================================================
// Entry Formatting
// ============================================================================

/**
 * Generate a commit-like message for a version entry
 */
export function generateCommitMessage(entry: VersionEntry): string {
  const action = getActionLabel(entry.action).toLowerCase();
  const entityName = entry.entityName || entry.entityId;

  if (entry.details.message) {
    return entry.details.message;
  }

  switch (entry.action) {
    case 'CREATED':
      return `Created ${entry.entityType.toLowerCase()} "${entityName}"`;
    case 'UPDATED':
      const changedFields = entry.details.changedFields;
      if (changedFields && changedFields.length > 0) {
        const fieldList = changedFields.slice(0, 3).join(', ');
        const more = changedFields.length > 3 ? ` and ${changedFields.length - 3} more` : '';
        return `Updated ${fieldList}${more} in "${entityName}"`;
      }
      return `Updated ${entry.entityType.toLowerCase()} "${entityName}"`;
    case 'DELETED':
      return `Deleted ${entry.entityType.toLowerCase()} "${entityName}"`;
    case 'APPROVED':
      return `Approved changes to "${entityName}"`;
    case 'REJECTED':
      return `Rejected changes to "${entityName}"`;
    case 'DEPLOYED':
      return `Deployed "${entityName}" to production`;
    case 'REVERTED':
      return `Reverted "${entityName}" to previous version`;
    default:
      return `${action} ${entry.entityType.toLowerCase()} "${entityName}"`;
  }
}

/**
 * Format entity type for display
 */
export function formatEntityType(entityType: string): string {
  return entityType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Convert version entries to CSV format
 */
export function entriesToCSV(entries: VersionEntry[]): string {
  const headers = ['Timestamp', 'Action', 'Entity Type', 'Entity Name', 'User', 'Status', 'Message'];
  const rows = entries.map((entry) => [
    formatTimestamp(entry.timestamp),
    getActionLabel(entry.action),
    formatEntityType(entry.entityType),
    entry.entityName || entry.entityId,
    getUserDisplayName(entry.user),
    entry.deployState ? getDeployStateLabel(entry.deployState) : 'N/A',
    generateCommitMessage(entry),
  ]);

  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n');
  return csvContent;
}

/**
 * Convert version entries to JSON format for export
 */
export function entriesToJSON(entries: VersionEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

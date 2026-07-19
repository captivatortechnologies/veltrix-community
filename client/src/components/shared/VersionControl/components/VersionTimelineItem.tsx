/**
 * VersionTimelineItem Component
 * Renders a single entry in the version history timeline
 */

import { memo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Rocket,
  RotateCcw,
  Clock,
  GitCommit,
} from 'lucide-react';
import type { VersionTimelineItemProps, ConfigActionType, DeployState } from '../types';
import {
  formatRelativeTime,
  formatTimestamp,
  getUserInitials,
  getUserDisplayName,
  getUserAvatarColor,
  getActionLabel,
  getActionColorClasses,
  getDeployStateLabel,
  getDeployStateColorClasses,
  generateCommitMessage,
  formatEntityType,
} from '../utils/formatUtils';

// Action icons mapping
const actionIcons: Record<ConfigActionType, typeof Plus> = {
  CREATED: Plus,
  UPDATED: Pencil,
  DELETED: Trash2,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
  DEPLOYED: Rocket,
  REVERTED: RotateCcw,
};

function VersionTimelineItemComponent({
  entry,
  isSelected = false,
  isCompareMode = false,
  showUserAvatar = true,
  showEntityInfo = true,
  onClick,
  onCompareSelect,
}: VersionTimelineItemProps) {
  const ActionIcon = actionIcons[entry.action] || GitCommit;
  const avatarColor = getUserAvatarColor(entry.user.email);

  return (
    <div
      className={`relative flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 transition-colors cursor-pointer
        ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
      `}
      onClick={onClick}
    >
      {/* Timeline line */}
      <div className="absolute left-8 top-14 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Compare checkbox (if in compare mode) */}
      {isCompareMode && (
        <div className="flex-shrink-0 flex items-start pt-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onCompareSelect?.();
            }}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
      )}

      {/* User Avatar */}
      {showUserAvatar && (
        <div className="flex-shrink-0 relative z-10">
          {entry.user.avatar ? (
            <img
              src={entry.user.avatar}
              alt={getUserDisplayName(entry.user)}
              className="h-10 w-10 rounded-full object-cover border-2 border-white dark:border-gray-900 shadow-sm"
            />
          ) : (
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-medium text-sm border-2 border-white dark:border-gray-900 shadow-sm ${avatarColor}`}
            >
              {getUserInitials(entry.user)}
            </div>
          )}
          {/* Action icon badge */}
          <div className={`absolute -bottom-1 -right-1 p-1 rounded-full bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-700`}>
            <ActionIcon className={`h-3 w-3 ${getActionIconColor(entry.action)}`} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* User name */}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {getUserDisplayName(entry.user)}
          </span>

          {/* Action badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getActionColorClasses(entry.action)}`}>
            <ActionIcon className="h-3 w-3" />
            {getActionLabel(entry.action)}
          </span>

          {/* Deploy state badge */}
          {entry.deployState && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getDeployStateColorClasses(entry.deployState)}`}>
              {getDeployStateIcon(entry.deployState)}
              {getDeployStateLabel(entry.deployState)}
            </span>
          )}
        </div>

        {/* Commit message */}
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          {generateCommitMessage(entry)}
        </p>

        {/* Entity info */}
        {showEntityInfo && (
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">
              {formatEntityType(entry.entityType)}
            </span>
            {entry.entityName && (
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {entry.entityName}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          <time dateTime={entry.timestamp} title={formatTimestamp(entry.timestamp)}>
            {formatRelativeTime(entry.timestamp)}
          </time>
        </div>

        {/* Changed fields preview */}
        {entry.details.changedFields && entry.details.changedFields.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {entry.details.changedFields.slice(0, 5).map((field) => (
              <span
                key={field}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {field}
              </span>
            ))}
            {entry.details.changedFields.length > 5 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{entry.details.changedFields.length - 5} more
              </span>
            )}
          </div>
        )}

        {/* Key-Value Configuration Data */}
        {(() => {
          // Determine which data to display
          const displayData = entry.details.newValue || entry.details.oldValue ||
            (Object.keys(entry.details).length > 0 ? entry.details : null);

          if (!displayData) return null;

          // Filter out internal/system fields that shouldn't be shown to users
          const internalFields = new Set([
            'id',
            'customerId',
            'defaultConfigId',
            'createdBy',
            'createdAt',
            'updatedAt',
            'oldValue',
            'newValue',
            'changedFields',
            'message',
            'deployState', // Already shown as a badge above
            'tagId',
            'userId',
            'configId',
          ]);

          const filteredEntries = Object.entries(displayData).filter(
            ([key]) => !internalFields.has(key)
          );

          if (filteredEntries.length === 0) return null;

          return (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Configuration Details
              </p>
              <div className="space-y-1 max-h-[150px] overflow-y-auto">
                {filteredEntries.map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="font-mono font-medium text-gray-700 dark:text-gray-300 min-w-[120px] flex-shrink-0">
                      {key}:
                    </span>
                    <span className="font-mono text-gray-600 dark:text-gray-400 break-all">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Version hash (like git commit hash) */}
      <div className="flex-shrink-0 text-right">
        <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
          {entry.id.slice(0, 7)}
        </span>
      </div>
    </div>
  );
}

// Helper functions for icons
function getActionIconColor(action: ConfigActionType): string {
  const colors: Record<ConfigActionType, string> = {
    CREATED: 'text-green-600 dark:text-green-400',
    UPDATED: 'text-blue-600 dark:text-blue-400',
    DELETED: 'text-red-600 dark:text-red-400',
    APPROVED: 'text-emerald-600 dark:text-emerald-400',
    REJECTED: 'text-orange-600 dark:text-orange-400',
    DEPLOYED: 'text-purple-600 dark:text-purple-400',
    REVERTED: 'text-yellow-600 dark:text-yellow-400',
  };
  return colors[action] || 'text-gray-600 dark:text-gray-400';
}

function getDeployStateIcon(state: DeployState | string | undefined): JSX.Element | null {
  if (!state) return null;

  const icons: Record<DeployState, JSX.Element> = {
    pending_approval: <Clock className="h-3 w-3" />,
    approved: <CheckCircle className="h-3 w-3" />,
    rejected: <XCircle className="h-3 w-3" />,
    deployed: <Rocket className="h-3 w-3" />,
    draft: <Pencil className="h-3 w-3" />,
  };

  // Normalize the state to handle space vs underscore differences
  const normalizedState = state.replace(/\s+/g, '_') as DeployState;
  return icons[normalizedState] || null;
}

export const VersionTimelineItem = memo(VersionTimelineItemComponent);

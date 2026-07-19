/**
 * VersionCompareModal Component
 * Compares two version entries side by side
 */

import { memo, useMemo } from 'react';
import {
  X,
  ArrowLeftRight,
  Clock,
  User,
} from 'lucide-react';
import type { VersionCompareModalProps } from '../types';
import { DiffViewer } from './DiffViewer';
import { computeVersionDiff } from '../utils/diffUtils';
import {
  formatTimestamp,
  formatRelativeTime,
  getUserDisplayName,
  getUserInitials,
  getUserAvatarColor,
  getActionLabel,
  getActionColorClasses,
  generateCommitMessage,
} from '../utils/formatUtils';

function VersionCompareModalComponent({
  fromVersion,
  toVersion,
  isOpen,
  onClose,
  onSwapVersions,
  customDiffTabs,
  defaultDiffView,
}: VersionCompareModalProps) {
  if (!isOpen || !fromVersion || !toVersion) return null;

  const diff = useMemo(() => {
    return computeVersionDiff(fromVersion, toVersion);
  }, [fromVersion, toVersion]);

  const fromAvatarColor = getUserAvatarColor(fromVersion.user.email);
  const toAvatarColor = getUserAvatarColor(toVersion.user.email);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-5xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Compare Versions
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Version Cards */}
          <div className="grid grid-cols-2 gap-4 p-6 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            {/* From Version */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200 mb-3">
                <span className="px-2 py-0.5 rounded bg-red-200 dark:bg-red-800 text-xs">
                  FROM
                </span>
                <span className="font-mono">{fromVersion.id.slice(0, 7)}</span>
              </div>

              <div className="flex items-start gap-3">
                {fromVersion.user.avatar ? (
                  <img
                    src={fromVersion.user.avatar}
                    alt={getUserDisplayName(fromVersion.user)}
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${fromAvatarColor}`}
                  >
                    {getUserInitials(fromVersion.user)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {generateCommitMessage(fromVersion)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className={`px-1.5 py-0.5 rounded-full ${getActionColorClasses(fromVersion.action)}`}>
                      {getActionLabel(fromVersion.action)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {getUserDisplayName(fromVersion.user)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    <time title={formatTimestamp(fromVersion.timestamp)}>
                      {formatRelativeTime(fromVersion.timestamp)}
                    </time>
                  </div>
                </div>
              </div>
            </div>

            {/* Swap Button */}
            <div className="absolute left-1/2 top-[calc(50%-24px)] -translate-x-1/2 z-10 hidden md:block">
              {onSwapVersions && (
                <button
                  onClick={onSwapVersions}
                  className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  title="Swap versions"
                >
                  <ArrowLeftRight className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
              )}
            </div>

            {/* To Version */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-200 mb-3">
                <span className="px-2 py-0.5 rounded bg-green-200 dark:bg-green-800 text-xs">
                  TO
                </span>
                <span className="font-mono">{toVersion.id.slice(0, 7)}</span>
              </div>

              <div className="flex items-start gap-3">
                {toVersion.user.avatar ? (
                  <img
                    src={toVersion.user.avatar}
                    alt={getUserDisplayName(toVersion.user)}
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0 ${toAvatarColor}`}
                  >
                    {getUserInitials(toVersion.user)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {generateCommitMessage(toVersion)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className={`px-1.5 py-0.5 rounded-full ${getActionColorClasses(toVersion.action)}`}>
                      {getActionLabel(toVersion.action)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {getUserDisplayName(toVersion.user)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    <time title={formatTimestamp(toVersion.timestamp)}>
                      {formatRelativeTime(toVersion.timestamp)}
                    </time>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Diff Summary */}
          <div className="px-6 py-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Changes:</span>
              {diff.summary.added > 0 && (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                  +{diff.summary.added} added
                </span>
              )}
              {diff.summary.removed > 0 && (
                <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                  -{diff.summary.removed} removed
                </span>
              )}
              {diff.summary.modified > 0 && (
                <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-300">
                  ~{diff.summary.modified} modified
                </span>
              )}
              {diff.summary.added === 0 &&
                diff.summary.removed === 0 &&
                diff.summary.modified === 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    No changes
                  </span>
                )}
            </div>
          </div>

          {/* Diff View */}
          <div className="p-6 max-h-[400px] overflow-auto">
            <DiffViewer
              oldValue={fromVersion.details.newValue || fromVersion.details.oldValue || null}
              newValue={toVersion.details.newValue || null}
              title="Detailed Changes"
              mode="side-by-side"
              collapsible={false}
              customDiffTabs={customDiffTabs}
              defaultDiffView={defaultDiffView}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const VersionCompareModal = memo(VersionCompareModalComponent);

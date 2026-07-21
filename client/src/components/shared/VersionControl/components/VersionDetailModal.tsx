/**
 * VersionDetailModal Component
 * Shows full details of a version entry with diff view and actions.
 * For pending approvals, shows Approve/Reject with a comment field (like a PR review).
 */

import { memo, useState } from 'react';
import {
  X,
  RotateCcw,
  GitCompare,
  Download,
  Clock,
  User,
  FileText,
  CheckCircle,
  XCircle,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import type { VersionDetailModalProps } from '../types';
import { DiffViewer } from './DiffViewer';
import {
  formatTimestamp,
  getUserDisplayName,
  getUserInitials,
  getUserAvatarColor,
  getActionLabel,
  getActionColorClasses,
  getDeployStateLabel,
  getDeployStateColorClasses,
  generateCommitMessage,
  formatEntityType,
  entriesToJSON,
} from '../utils/formatUtils';
import { INTERNAL_FIELDS, computeObjectDiff, getChangedFields, computeDiffSummary } from '../utils/diffUtils';

function VersionDetailModalComponent({
  entry,
  isOpen,
  onClose,
  onRevert,
  onCompare,
  onApprove,
  onReject,
  customDiffTabs,
  defaultDiffView,
}: VersionDetailModalProps) {
  const [reviewComment, setReviewComment] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  if (!isOpen || !entry) return null;

  // The API sends both the canonical 'pending_approval' and the legacy
  // space-separated 'pending approval' (the server-side default). Widen to
  // string here, matching how formatUtils handles both wire formats.
  const deployState: string | undefined = entry.deployState;
  const isPendingApproval =
    deployState === 'pending_approval' ||
    deployState === 'pending approval';

  const avatarColor = getUserAvatarColor(entry.user.email);

  // Derive the ACTUAL changes from oldValue/newValue so the field chips + counts
  // match the diff below. The server's `changedFields` can over-report — e.g. a
  // "Submitted for approval" entry that only really changed `status` still lists
  // every field — so prefer the computed diff and fall back to changedFields only
  // when no before/after snapshot is available.
  const oldValue = (entry.details.oldValue ?? null) as Record<string, unknown> | null;
  const newValue = (entry.details.newValue ?? null) as Record<string, unknown> | null;
  const diffChanges =
    oldValue || newValue ? computeObjectDiff(oldValue ?? {}, newValue ?? {}) : [];
  const realChangedFields = (
    diffChanges.length > 0 ? getChangedFields(diffChanges) : entry.details.changedFields ?? []
  ).filter((field: string) => !INTERNAL_FIELDS.has(field));
  const summary = computeDiffSummary(diffChanges);

  const handleExport = () => {
    const json = entriesToJSON([entry]);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `version-${entry.id.slice(0, 7)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApprove = async () => {
    if (!onApprove) return;
    setIsApproving(true);
    try {
      await onApprove(entry.id, reviewComment.trim() || undefined);
      setReviewComment('');
      onClose();
    } catch {
      // Error handling is done by the parent
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!onReject) return;
    setIsRejecting(true);
    try {
      await onReject(entry.id, reviewComment.trim() || undefined);
      setReviewComment('');
      onClose();
    } catch {
      // Error handling is done by the parent
    } finally {
      setIsRejecting(false);
    }
  };

  const handleClose = () => {
    if (!isApproving && !isRejecting) {
      setReviewComment('');
      onClose();
    }
  };

  const isSubmitting = isApproving || isRejecting;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl transform transition-all">
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-4">
              {/* User avatar */}
              {entry.user.avatar ? (
                <img
                  src={entry.user.avatar}
                  alt={getUserDisplayName(entry.user)}
                  className="h-12 w-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-medium flex-shrink-0 ${avatarColor}`}
                >
                  {getUserInitials(entry.user)}
                </div>
              )}

              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {generateCommitMessage(entry)}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {getUserDisplayName(entry.user)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                    {entry.id.slice(0, 7)}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Metadata */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-3">
              {/* Action badge */}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${getActionColorClasses(entry.action)}`}>
                {getActionLabel(entry.action)}
              </span>

              {/* Deploy state badge */}
              {entry.deployState && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium ${getDeployStateColorClasses(entry.deployState)}`}>
                  {getDeployStateLabel(entry.deployState)}
                </span>
              )}

              {/* Entity type */}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
                <FileText className="h-4 w-4" />
                {formatEntityType(entry.entityType)}
              </span>

              {/* Entity name */}
              {entry.entityName && (
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {entry.entityName}
                </span>
              )}
            </div>

            {/* Changed fields — derived from the actual diff so it matches Changes below. */}
            {realChangedFields.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Changed fields ({realChangedFields.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {realChangedFields.map((field: string) => (
                    <span
                      key={field}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Diff View / Configuration Details */}
          <div className="p-6 max-h-[400px] overflow-auto">
            {(oldValue || newValue) && (summary.added + summary.modified + summary.removed) > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium">
                {summary.added > 0 && (
                  <span className="inline-flex items-center rounded px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    +{summary.added} added
                  </span>
                )}
                {summary.modified > 0 && (
                  <span className="inline-flex items-center rounded px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    ~{summary.modified} modified
                  </span>
                )}
                {summary.removed > 0 && (
                  <span className="inline-flex items-center rounded px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    -{summary.removed} removed
                  </span>
                )}
              </div>
            )}
            {entry.details.oldValue || entry.details.newValue ? (
              <DiffViewer
                oldValue={entry.details.oldValue || null}
                newValue={entry.details.newValue || null}
                title="Changes"
                collapsible={false}
                customDiffTabs={customDiffTabs}
                defaultDiffView={defaultDiffView}
              />
            ) : (
              // Fallback: Display any available details in key-value format
              (() => {
                // Filter out internal fields
                const filteredDetails = Object.entries(entry.details).filter(
                  ([key]) => !INTERNAL_FIELDS.has(key)
                );
                return (
                  <div>
                    {filteredDetails.length > 0 ? (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Configuration Details
                        </p>
                        <div className="space-y-2">
                          {filteredDetails.map(([key, value]) => (
                            <div key={key} className="flex items-start gap-3 text-sm">
                              <span className="font-mono font-medium text-gray-600 dark:text-gray-400 min-w-[140px] flex-shrink-0">
                                {key}:
                              </span>
                              <span className="font-mono text-gray-800 dark:text-gray-200 break-all">
                                {typeof value === 'object'
                                  ? <pre className="whitespace-pre-wrap bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs">{JSON.stringify(value, null, 2)}</pre>
                                  : String(value)
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No detailed changes available for this version</p>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>

          {/* Review comment for pending approvals */}
          {isPendingApproval && (onApprove || onReject) && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Review Comment
                </label>
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Leave a comment for the submitter (optional)..."
                rows={3}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <button
              onClick={handleExport}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </button>

            <div className="flex items-center gap-2">
              {/* Non-pending: Compare & Revert */}
              {!isPendingApproval && (
                <>
                  {onCompare && (
                    <button
                      onClick={() => onCompare(entry)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      <GitCompare className="h-4 w-4" />
                      Compare
                    </button>
                  )}

                  {onRevert && entry.action !== 'DELETED' && (
                    <button
                      onClick={() => onRevert(entry.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Revert to This Version
                    </button>
                  )}
                </>
              )}

              {/* Pending approval: Reject & Approve */}
              {isPendingApproval && (
                <>
                  {onReject && (
                    <button
                      onClick={handleReject}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRejecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      Reject
                    </button>
                  )}

                  {onApprove && (
                    <button
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isApproving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const VersionDetailModal = memo(VersionDetailModalComponent);

/**
 * ApprovalCard Component
 * Displays a single pending approval with actions
 */

import { memo, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Eye,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';
import type { ApprovalCardProps } from '../types';
import {
  formatRelativeTime,
  formatTimestamp,
  getUserDisplayName,
  getUserInitials,
  getUserAvatarColor,
  generateCommitMessage,
  formatEntityType,
} from '../utils/formatUtils';

function ApprovalCardComponent({
  entry,
  onApprove,
  onReject,
  onViewDetails,
  isApproving = false,
  isRejecting = false,
}: ApprovalCardProps) {
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const avatarColor = getUserAvatarColor(entry.user.email);

  const handleReject = () => {
    if (showRejectReason) {
      onReject?.(rejectReason);
      setShowRejectReason(false);
      setRejectReason('');
    } else {
      setShowRejectReason(true);
    }
  };

  const handleCancelReject = () => {
    setShowRejectReason(false);
    setRejectReason('');
  };

  const isProcessing = isApproving || isRejecting;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-100 dark:border-yellow-800">
        {/* User avatar */}
        {entry.user.avatar ? (
          <img
            src={entry.user.avatar}
            alt={getUserDisplayName(entry.user)}
            className="h-10 w-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0 ${avatarColor}`}
          >
            {getUserInitials(entry.user)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {getUserDisplayName(entry.user)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              <Clock className="h-3 w-3" />
              Pending Approval
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            {generateCommitMessage(entry)}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {formatEntityType(entry.entityType)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <time dateTime={entry.timestamp} title={formatTimestamp(entry.timestamp)}>
                {formatRelativeTime(entry.timestamp)}
              </time>
            </span>
          </div>
        </div>
      </div>

      {/* Changed fields */}
      {entry.details.changedFields && entry.details.changedFields.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Changed fields:
          </p>
          <div className="flex flex-wrap gap-1">
            {entry.details.changedFields.map((field) => (
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

      {/* Reject reason input */}
      {showRejectReason && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
          <label className="block text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Reason for rejection (optional):
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter a reason for rejecting this change..."
            className="w-full px-3 py-2 text-sm rounded-md border border-red-200 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            rows={2}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onViewDetails}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <Eye className="h-4 w-4" />
          View Details
        </button>

        <div className="flex items-center gap-2">
          {showRejectReason ? (
            <>
              <button
                onClick={handleCancelReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Confirm Reject
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
              <button
                onClick={() => onApprove?.()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50"
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const ApprovalCard = memo(ApprovalCardComponent);

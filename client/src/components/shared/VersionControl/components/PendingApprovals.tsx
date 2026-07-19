/**
 * PendingApprovals Component
 * Displays a list of changes awaiting approval
 */

import { memo, useState } from 'react';
import { Clock, Loader2, CheckCircle2, Filter } from 'lucide-react';
import type { PendingApprovalsProps, VersionEntry } from '../types';
import { ApprovalCard } from './ApprovalCard';
import { formatEntityType } from '../utils/formatUtils';

function PendingApprovalsComponent({
  entries,
  isLoading = false,
  onApprove,
  onReject,
  onViewDetails,
  className = '',
}: PendingApprovalsProps) {
  const [processingIds, setProcessingIds] = useState<{
    approving: Set<string>;
    rejecting: Set<string>;
  }>({ approving: new Set(), rejecting: new Set() });

  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');

  // Get unique entity types for filter
  const entityTypes = Array.from(new Set(entries.map((e) => e.entityType)));

  // Filter entries
  const filteredEntries =
    entityTypeFilter === 'all'
      ? entries
      : entries.filter((e) => e.entityType === entityTypeFilter);

  const handleApprove = async (entry: VersionEntry) => {
    if (!onApprove) return;

    setProcessingIds((prev) => ({
      ...prev,
      approving: new Set([...prev.approving, entry.id]),
    }));

    try {
      await onApprove(entry.id);
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev.approving);
        newSet.delete(entry.id);
        return { ...prev, approving: newSet };
      });
    }
  };

  const handleReject = async (entry: VersionEntry, reason?: string) => {
    if (!onReject) return;

    setProcessingIds((prev) => ({
      ...prev,
      rejecting: new Set([...prev.rejecting, entry.id]),
    }));

    try {
      await onReject(entry.id, reason);
    } finally {
      setProcessingIds((prev) => {
        const newSet = new Set(prev.rejecting);
        newSet.delete(entry.id);
        return { ...prev, rejecting: newSet };
      });
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Pending Approvals
          </h3>
          {entries.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
              {entries.length}
            </span>
          )}
        </div>

        {/* Entity type filter */}
        {entityTypes.length > 1 && (
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {formatEntityType(type)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Content - auto height, no scrollbar */}
      <div className="h-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <CheckCircle2 className="h-12 w-12 mb-3 text-green-500 opacity-50" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm">No pending approvals at this time</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Filter className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">No matching items</p>
            <p className="text-sm">Try adjusting your filter</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {filteredEntries.map((entry) => (
              <ApprovalCard
                key={entry.id}
                entry={entry}
                onApprove={() => handleApprove(entry)}
                onReject={(reason) => handleReject(entry, reason)}
                onViewDetails={() => onViewDetails?.(entry)}
                isApproving={processingIds.approving.has(entry.id)}
                isRejecting={processingIds.rejecting.has(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const PendingApprovals = memo(PendingApprovalsComponent);

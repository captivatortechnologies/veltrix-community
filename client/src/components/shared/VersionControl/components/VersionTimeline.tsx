/**
 * VersionTimeline Component
 * Displays a chronological list of version entries (like git log)
 */

import { memo, useState, useCallback } from 'react';
import { History, GitCompare, Loader2 } from 'lucide-react';
import type { VersionTimelineProps, VersionEntry } from '../types';
import { VersionTimelineItem } from './VersionTimelineItem';

/**
 * A version entry represents an ACTUAL configuration content change — the only
 * thing worth diffing. Workflow transitions (submit-for-approval / approve /
 * request-changes / deploy) don't change the config content, so they are
 * excluded from Compare even though they appear in the full audit timeline.
 * Distinguished by deployState (a workflow state) or a workflow action.
 */
function isConfigurationChange(entry: VersionEntry): boolean {
  const workflowStates = ['pending_approval', 'approved', 'rejected', 'deployed'];
  if (entry.deployState && workflowStates.includes(entry.deployState)) return false;
  if (['APPROVED', 'REJECTED', 'DEPLOYED', 'DELETED', 'REVERTED'].includes(entry.action)) return false;
  return entry.action === 'CREATED' || entry.action === 'UPDATED';
}

/** Upper bound on how many versions can be compared side by side at once. */
const MAX_COMPARE = 6;

function VersionTimelineComponent({
  entries,
  isLoading = false,
  selectedEntryId,
  showUserAvatar = true,
  showEntityInfo = true,
  onEntryClick,
  onCompare,
  onCompareMulti,
  className = '',
}: VersionTimelineProps) {
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<VersionEntry[]>([]);
  // Multi-select is available when a multi-compare handler is wired; otherwise
  // fall back to the legacy exactly-two pairwise compare.
  const compareEnabled = Boolean(onCompareMulti || onCompare);
  const maxSelectable = onCompareMulti ? MAX_COMPARE : 2;

  const handleEntryClick = useCallback(
    (entry: VersionEntry) => {
      if (isCompareMode) {
        handleCompareSelect(entry);
      } else {
        onEntryClick?.(entry);
      }
    },
    [isCompareMode, onEntryClick]
  );

  const handleCompareSelect = (entry: VersionEntry) => {
    setCompareSelection((prev) => {
      const isSelected = prev.some((e) => e.id === entry.id);
      if (isSelected) {
        return prev.filter((e) => e.id !== entry.id);
      }
      if (prev.length >= maxSelectable) {
        // At the cap: drop the oldest selection to make room for the new one.
        return [...prev.slice(1), entry];
      }
      return [...prev, entry];
    });
  };

  const handleCompare = () => {
    if (compareSelection.length < 2) return;
    // Sort by timestamp (older first) so columns read left-to-right in time.
    const sorted = [...compareSelection].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (onCompareMulti) {
      onCompareMulti(sorted);
    } else if (onCompare && sorted.length === 2) {
      onCompare(sorted[0], sorted[1]);
    }
    setCompareSelection([]);
    setIsCompareMode(false);
  };

  const toggleCompareMode = () => {
    setIsCompareMode(!isCompareMode);
    if (isCompareMode) {
      setCompareSelection([]);
    }
  };

  const isEntrySelected = (entry: VersionEntry) => {
    if (isCompareMode) {
      return compareSelection.some((e) => e.id === entry.id);
    }
    return entry.id === selectedEntryId;
  };

  // In compare mode only real configuration-change versions are shown/selectable;
  // the full audit timeline (submit/approve/deploy/…) still shows otherwise.
  const displayEntries = isCompareMode ? entries.filter(isConfigurationChange) : entries;

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            Version History
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({entries.length} {entries.length === 1 ? 'entry' : 'entries'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Compare mode controls */}
          {compareEnabled && (
            <>
              {isCompareMode && compareSelection.length >= 2 && (
                <button
                  onClick={handleCompare}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-950 bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
                >
                  <GitCompare className="h-4 w-4" />
                  Compare Selected ({compareSelection.length})
                </button>
              )}
              <button
                onClick={toggleCompareMode}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isCompareMode
                    ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <GitCompare className="h-4 w-4" />
                {isCompareMode ? 'Cancel' : 'Compare'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Compare mode instructions */}
      {isCompareMode && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {onCompareMulti
              ? `Select 2–${maxSelectable} configuration-change versions to compare.`
              : 'Select 2 configuration-change versions to compare.'}{' '}
            <span className="font-medium">
              {compareSelection.length}
              {onCompareMulti ? '' : '/2'} selected
            </span>
          </p>
        </div>
      )}

      {/* Content - auto height, no scrollbar */}
      <div className="h-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : displayEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <History className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">
              {isCompareMode ? 'No configuration changes to compare' : 'No history yet'}
            </p>
            <p className="text-sm">
              {isCompareMode ? 'Only content edits can be compared' : 'Changes will appear here once made'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {displayEntries.map((entry) => (
              <VersionTimelineItem
                key={entry.id}
                entry={entry}
                isSelected={isEntrySelected(entry)}
                isCompareMode={isCompareMode}
                showUserAvatar={showUserAvatar}
                showEntityInfo={showEntityInfo}
                onClick={() => handleEntryClick(entry)}
                onCompareSelect={() => handleCompareSelect(entry)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const VersionTimeline = memo(VersionTimelineComponent);

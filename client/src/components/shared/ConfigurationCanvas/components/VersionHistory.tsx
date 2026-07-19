/**
 * VersionHistory
 *
 * Displays version history timeline for a configuration canvas.
 * Supports viewing, comparing, restoring, and labeling versions.
 */

import React, { useState, useCallback } from 'react';
import {
  History,
  RotateCcw,
  GitCompare,
  Tag,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  ArrowRight,
  User,
  Calendar,
  FileText,
} from 'lucide-react';

// Types
interface HistoryUser {
  id: string;
  name: string;
  email: string;
}

interface HistoryEntry {
  id: string;
  canvasId: string;
  version: number;
  action: 'CREATED' | 'UPDATED' | 'APPROVED' | 'REJECTED' | 'DEPLOYED' | 'RESTORED';
  snapshot: Record<string, unknown>;
  comment?: string;
  createdAt: string;
  user: HistoryUser;
}

interface DiffChange {
  type: 'added' | 'removed' | 'modified';
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

interface VersionDiff {
  totalChanges: number;
  added: number;
  removed: number;
  modified: number;
  changes: DiffChange[];
}

interface VersionHistoryProps {
  history: HistoryEntry[];
  currentVersion: number;
  canRestore: boolean;
  onRestore?: (historyId: string) => Promise<void>;
  onCompare?: (historyId1: string, historyId2: string) => Promise<VersionDiff>;
  onLabel?: (historyId: string, label: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

// Action badge colors
const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  CREATED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300' },
  UPDATED: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  APPROVED: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  REJECTED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  DEPLOYED: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  RESTORED: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
};

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  history,
  currentVersion,
  canRestore,
  onRestore,
  onCompare,
  onLabel,
  isLoading = false,
  className = '',
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [labelingId, setLabelingId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');

  // Toggle entry expansion
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Handle version selection for comparison
  const handleVersionSelect = useCallback((id: string) => {
    if (!compareMode) return;

    setSelectedVersions((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length < 2) {
        return [...prev, id];
      }
      // Replace the second selection
      return [prev[0], id];
    });
  }, [compareMode]);

  // Compare selected versions
  const handleCompare = useCallback(async () => {
    if (selectedVersions.length !== 2 || !onCompare) return;

    setIsComparing(true);
    try {
      const result = await onCompare(selectedVersions[0], selectedVersions[1]);
      setDiff(result);
    } catch (error) {
      console.error('Failed to compare versions:', error);
    } finally {
      setIsComparing(false);
    }
  }, [selectedVersions, onCompare]);

  // Restore to version
  const handleRestore = useCallback(async (historyId: string) => {
    if (!onRestore || !canRestore) return;

    setIsRestoring(true);
    try {
      await onRestore(historyId);
    } catch (error) {
      console.error('Failed to restore version:', error);
    } finally {
      setIsRestoring(false);
    }
  }, [onRestore, canRestore]);

  // Save label
  const handleSaveLabel = useCallback(async (historyId: string) => {
    if (!onLabel || !labelInput.trim()) return;

    try {
      await onLabel(historyId, labelInput.trim());
      setLabelingId(null);
      setLabelInput('');
    } catch (error) {
      console.error('Failed to save label:', error);
    }
  }, [onLabel, labelInput]);

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Exit compare mode
  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedVersions([]);
    setDiff(null);
  };

  if (history.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center ${className}`}>
        <History className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          No version history
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Changes will be recorded here when you save configurations.
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Version History
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            (v{currentVersion})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {compareMode ? (
            <>
              <button
                onClick={handleCompare}
                disabled={selectedVersions.length !== 2 || isComparing}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitCompare className="w-4 h-4" />
                {isComparing ? 'Comparing...' : 'Compare'}
              </button>
              <button
                onClick={exitCompareMode}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setCompareMode(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              <GitCompare className="w-4 h-4" />
              Compare
            </button>
          )}
        </div>
      </div>

      {/* Compare mode hint */}
      {compareMode && selectedVersions.length < 2 && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
          Select {2 - selectedVersions.length} more version{selectedVersions.length === 0 ? 's' : ''} to compare
        </div>
      )}

      {/* Diff view */}
      {diff && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900 dark:text-white">
              Comparison Results
            </h4>
            <button
              onClick={() => setDiff(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Summary */}
          <div className="flex gap-4 mb-4 text-sm">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Plus className="w-4 h-4" />
              {diff.added} added
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Minus className="w-4 h-4" />
              {diff.removed} removed
            </span>
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <ArrowRight className="w-4 h-4" />
              {diff.modified} modified
            </span>
          </div>

          {/* Changes list */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {diff.changes.map((change, idx) => (
              <div
                key={idx}
                className={`p-2 rounded text-sm ${
                  change.type === 'added'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                    : change.type === 'removed'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                }`}
              >
                <div className="font-mono text-xs">{change.path}</div>
                {change.type === 'modified' && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-red-600 dark:text-red-400 line-through">
                      {JSON.stringify(change.oldValue)}
                    </span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-green-600 dark:text-green-400">
                      {JSON.stringify(change.newValue)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {history.map((entry, idx) => {
          const isExpanded = expandedId === entry.id;
          const isSelected = selectedVersions.includes(entry.id);
          const actionColor = ACTION_COLORS[entry.action] || ACTION_COLORS.UPDATED;

          return (
            <div
              key={entry.id}
              className={`relative ${
                compareMode && isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
              onClick={() => handleVersionSelect(entry.id)}
            >
              {/* Timeline indicator */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
              <div className={`absolute left-[11px] top-4 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800 ${
                idx === 0 ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
              }`} />

              <div className="pl-10 pr-4 py-3">
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {compareMode && (
                      <div className={`w-5 h-5 rounded border ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-300 dark:border-gray-600'
                      } flex items-center justify-center`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    )}

                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${actionColor.bg} ${actionColor.text}`}>
                      {entry.action}
                    </span>

                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      v{entry.version}
                    </span>

                    {entry.comment && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Tag className="w-3 h-3" />
                        {entry.comment}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {!compareMode && canRestore && idx > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(entry.id);
                        }}
                        disabled={isRestoring}
                        className="p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                        title="Restore to this version"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}

                    {!compareMode && onLabel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLabelingId(entry.id);
                          setLabelInput(entry.comment || '');
                        }}
                        className="p-1 text-gray-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400"
                        title="Add label"
                      >
                        <Tag className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(entry.id);
                      }}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Metadata */}
                <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {entry.user.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(entry.createdAt)}
                  </span>
                </div>

                {/* Label input */}
                {labelingId === entry.id && (
                  <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      placeholder="Enter version label..."
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveLabel(entry.id)}
                      className="p-1 text-green-600 hover:text-green-700"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setLabelingId(null);
                        setLabelInput('');
                      }}
                      className="p-1 text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Snapshot
                      </span>
                    </div>
                    <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-h-40">
                      {JSON.stringify(entry.snapshot, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
};

export default VersionHistory;

/**
 * DiffViewer Component
 * Main component for displaying differences between two values
 * Supports side-by-side, inline, and unified view modes
 */

import { memo, useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Columns,
  AlignJustify,
  Copy,
  Check,
  Plus,
  Minus,
  RefreshCw,
  List,
} from 'lucide-react';
import type { DiffViewerProps, DiffChange } from '../types';
import {
  computeObjectDiff,
  computeLineDiff,
  computeDiffSummary,
  isObject,
} from '../utils/diffUtils';
import { FieldDiff } from './FieldDiff';
import { DiffLine } from './DiffLine';

function DiffViewerComponent({
  oldValue,
  newValue,
  title,
  mode = 'side-by-side',
  showLineNumbers = true,
  collapsible = true,
  defaultExpanded = true,
  maxHeight,
  className = '',
  customDiffTabs = [],
  defaultDiffView,
}: DiffViewerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [viewMode, setViewMode] = useState(mode);
  const [copied, setCopied] = useState(false);

  // Filter custom tabs based on shouldShow
  const visibleCustomTabs = useMemo(
    () => customDiffTabs.filter(
      (tab) => !tab.shouldShow || tab.shouldShow(oldValue, newValue)
    ),
    [customDiffTabs, oldValue, newValue]
  );

  const [activeDiffTab, setActiveDiffTab] = useState(
    defaultDiffView ?? (visibleCustomTabs.length > 0 ? visibleCustomTabs[0].id : 'fields')
  );

  // Fall back to 'fields' if active tab is no longer visible
  if (activeDiffTab !== 'fields' && !visibleCustomTabs.some(t => t.id === activeDiffTab)) {
    setActiveDiffTab('fields');
  }

  // Compute diff based on value types
  const { changes, summary, isTextDiff, lineDiff } = useMemo(() => {
    // Both null/undefined - no changes
    if (oldValue == null && newValue == null) {
      return {
        changes: [],
        summary: { added: 0, removed: 0, modified: 0, unchanged: 0 },
        isTextDiff: false,
        lineDiff: null,
      };
    }

    const oldIsObject = isObject(oldValue);
    const newIsObject = isObject(newValue);

    // Both are objects - compute field diff
    if (oldIsObject && newIsObject) {
      const objectChanges = computeObjectDiff(
        oldValue as Record<string, unknown>,
        newValue as Record<string, unknown>
      );
      return {
        changes: objectChanges,
        summary: computeDiffSummary(objectChanges),
        isTextDiff: false,
        lineDiff: null,
      };
    }

    // Strings - compute line diff
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      const lines = computeLineDiff(oldValue, newValue);
      return {
        changes: [],
        summary: {
          added: lines.filter((l) => l.type === 'added').length,
          removed: lines.filter((l) => l.type === 'removed').length,
          modified: 0,
          unchanged: lines.filter((l) => l.type === 'unchanged').length,
        },
        isTextDiff: true,
        lineDiff: lines,
      };
    }

    // Mixed types or null - show as modified
    return {
      changes: [
        {
          field: 'value',
          path: ['value'],
          oldValue,
          newValue,
          type: 'modified' as const,
        },
      ],
      summary: { added: 0, removed: 0, modified: 1, unchanged: 0 },
      isTextDiff: false,
      lineDiff: null,
    };
  }, [oldValue, newValue]);

  const handleCopy = async () => {
    const content = JSON.stringify({ old: oldValue, new: newValue }, null, 2);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasChanges = summary.added + summary.removed + summary.modified > 0;

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {collapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          )}
          {title && (
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          {/* Summary badges */}
          <div className="flex items-center gap-2 text-sm">
            {summary.added > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <Plus className="h-3 w-3" />
                {summary.added}
              </span>
            )}
            {summary.removed > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                <Minus className="h-3 w-3" />
                {summary.removed}
              </span>
            )}
            {summary.modified > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                <RefreshCw className="h-3 w-3" />
                {summary.modified}
              </span>
            )}
            {!hasChanges && (
              <span className="text-gray-500 dark:text-gray-400">No changes</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Diff view tab toggle (only for object diffs with custom tabs) */}
          {!isTextDiff && hasChanges && visibleCustomTabs.length > 0 && (
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
              <button
                onClick={() => setActiveDiffTab('fields')}
                className={`p-1.5 flex items-center gap-1 text-xs ${activeDiffTab === 'fields' ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                title="Field changes view"
              >
                <List className="h-3.5 w-3.5" />
                <span>Fields</span>
              </button>
              {visibleCustomTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDiffTab(tab.id)}
                  className={`p-1.5 flex items-center gap-1 text-xs ${activeDiffTab === tab.id ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                  title={tab.label}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* View mode toggle (only for text diff) */}
          {isTextDiff && (
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('side-by-side')}
                className={`p-1.5 ${viewMode === 'side-by-side' ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Side by side"
              >
                <Columns className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`p-1.5 ${viewMode === 'unified' ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                title="Unified"
              >
                <AlignJustify className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy diff"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div
          className="overflow-auto"
          style={{ maxHeight: maxHeight || 'auto' }}
        >
          {!hasChanges ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No differences found
            </div>
          ) : isTextDiff && lineDiff ? (
            <TextDiffView
              lineDiff={lineDiff}
              mode={viewMode}
              showLineNumbers={showLineNumbers}
            />
          ) : activeDiffTab !== 'fields' && visibleCustomTabs.find(t => t.id === activeDiffTab) ? (
            visibleCustomTabs.find(t => t.id === activeDiffTab)!.render(oldValue, newValue)
          ) : (
            <ObjectDiffView changes={changes} />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Text Diff View
// ============================================================================

interface TextDiffViewProps {
  lineDiff: ReturnType<typeof computeLineDiff>;
  mode: DiffViewerProps['mode'];
  showLineNumbers?: boolean;
}

function TextDiffView({ lineDiff, mode, showLineNumbers }: TextDiffViewProps) {
  if (mode === 'side-by-side') {
    const leftLines = lineDiff.filter((l) => l.type !== 'added');
    const rightLines = lineDiff.filter((l) => l.type !== 'removed');

    return (
      <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
        <div>
          <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm font-medium border-b border-gray-200 dark:border-gray-700">
            Previous
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {leftLines.map((line, idx) => (
              <DiffLine
                key={idx}
                content={line.content}
                type={line.type === 'removed' ? 'removed' : 'unchanged'}
                lineNumber={line.oldLineNumber}
                showLineNumber={showLineNumbers}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm font-medium border-b border-gray-200 dark:border-gray-700">
            Current
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {rightLines.map((line, idx) => (
              <DiffLine
                key={idx}
                content={line.content}
                type={line.type === 'added' ? 'added' : 'unchanged'}
                lineNumber={line.newLineNumber}
                showLineNumber={showLineNumbers}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Unified view
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {lineDiff.map((line, idx) => (
        <DiffLine
          key={idx}
          content={line.content}
          type={line.type}
          lineNumber={line.lineNumber}
          showLineNumber={showLineNumbers}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Object Diff View
// ============================================================================

interface ObjectDiffViewProps {
  changes: DiffChange[];
}

function ObjectDiffView({ changes }: ObjectDiffViewProps) {
  const significantChanges = changes.filter((c) => c.type !== 'unchanged');

  if (significantChanges.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No differences found
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {significantChanges.map((change, index) => (
        <FieldDiff key={`${change.field}-${index}`} change={change} />
      ))}
    </div>
  );
}

export const DiffViewer = memo(DiffViewerComponent);

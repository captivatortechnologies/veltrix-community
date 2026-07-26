/**
 * VersionMultiCompareModal Component
 * Compares 2..N selected versions side by side as columns. Each row is a field
 * (union across all selected versions); a row is highlighted when its value is
 * not identical across every version, and each differing cell is emphasized, so
 * you can clearly see the difference between ALL selected versions at once.
 */

import { memo, useMemo, useState } from 'react';
import { X, GitCompare } from 'lucide-react';
import type { VersionEntry } from '../types';
import { filterInternalFields } from '../utils/diffUtils';
import { formatTimestamp, getActionLabel, getActionColorClasses } from '../utils/formatUtils';

interface VersionMultiCompareModalProps {
  versions: VersionEntry[];
  isOpen: boolean;
  onClose: () => void;
}

/** The full, internal-field-filtered snapshot for a version. */
function snapshotOf(entry: VersionEntry): Record<string, unknown> {
  return filterInternalFields(
    (entry.details.newValue ?? entry.details.oldValue ?? {}) as Record<string, unknown>,
  );
}

/** Render a value as a stable, comparable cell string. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function VersionMultiCompareModalComponent({ versions, isOpen, onClose }: VersionMultiCompareModalProps) {
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  // Oldest -> newest so columns read left-to-right in time order.
  const sorted = useMemo(
    () => [...versions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [versions],
  );
  const snapshots = useMemo(() => sorted.map(snapshotOf), [sorted]);

  const rows = useMemo(() => {
    const fieldSet = new Set<string>();
    snapshots.forEach((snap) => Object.keys(snap).forEach((k) => fieldSet.add(k)));
    return Array.from(fieldSet)
      .sort()
      .map((field) => {
        const cells = snapshots.map((snap) => cellText(snap[field]));
        const differs = cells.some((c) => c !== cells[0]);
        return { field, cells, differs };
      });
  }, [snapshots]);

  const diffCount = rows.filter((r) => r.differs).length;
  const visibleRows = onlyDiffs ? rows.filter((r) => r.differs) : rows;

  if (!isOpen || versions.length < 2) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-6xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Compare {sorted.length} versions
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={onlyDiffs}
                  onChange={(e) => setOnlyDiffs(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Only differences
              </label>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Comparison grid — horizontal scroll for many/wide columns */}
          <div className="max-h-[70vh] overflow-auto p-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[140px] border-b border-gray-200 dark:border-gray-700 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Field
                  </th>
                  {sorted.map((v) => (
                    <th
                      key={v.id}
                      className="min-w-[220px] border-b border-l border-gray-200 dark:border-gray-700 px-3 py-2 text-left align-top"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="w-fit rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {v.id.slice(0, 7)}
                        </span>
                        <span className={`w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getActionColorClasses(v.action)}`}>
                          {getActionLabel(v.action)}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatTimestamp(v.timestamp)}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sorted.length + 1}
                      className="px-3 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      No differences across the selected versions
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr key={row.field} className={row.differs ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                      <td className="sticky left-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white px-3 py-2 align-top font-mono font-medium text-gray-600 break-all dark:bg-gray-900 dark:text-gray-400">
                        {row.field}
                      </td>
                      {row.cells.map((cell, i) => {
                        const isDiff = row.differs && cell !== row.cells[0];
                        return (
                          <td
                            key={i}
                            className={`border-b border-l border-gray-100 dark:border-gray-800 px-3 py-2 align-top font-mono text-xs break-all ${
                              isDiff
                                ? 'font-medium text-amber-800 dark:text-amber-300'
                                : 'text-gray-800 dark:text-gray-200'
                            }`}
                          >
                            {cell === '' ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span className="whitespace-pre-wrap">{cell}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 px-6 py-4 dark:bg-gray-800/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {diffCount} field{diffCount === 1 ? '' : 's'} differ across {sorted.length} versions
            </span>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const VersionMultiCompareModal = memo(VersionMultiCompareModalComponent);

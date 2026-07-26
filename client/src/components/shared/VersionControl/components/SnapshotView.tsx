/**
 * SnapshotView Component
 * Renders the FULL configuration content of a single version (not just the diff),
 * so a delta-only entry (e.g. a status change) still shows everything the config
 * holds. Internal/system fields are filtered; objects/arrays render as JSON.
 */

import { memo } from 'react';
import { filterInternalFields } from '../utils/diffUtils';

interface SnapshotViewProps {
  title?: string;
  snapshot: Record<string, unknown> | null | undefined;
  /** Tint for the header dot (e.g. compare FROM/TO). */
  accent?: 'neutral' | 'from' | 'to';
}

const ACCENT_DOT: Record<NonNullable<SnapshotViewProps['accent']>, string> = {
  neutral: 'bg-gray-400 dark:bg-gray-500',
  from: 'bg-red-500',
  to: 'bg-green-500',
};

function SnapshotViewComponent({
  title = 'Configuration at this version',
  snapshot,
  accent = 'neutral',
}: SnapshotViewProps) {
  if (!snapshot) return null;
  const entries = Object.entries(filterInternalFields(snapshot));
  if (entries.length === 0) return null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        <span className={`h-2 w-2 rounded-full ${ACCENT_DOT[accent]}`} aria-hidden="true" />
        {title}
      </p>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3">
            <span className="font-mono font-medium text-gray-600 dark:text-gray-400 break-all sm:min-w-[160px] sm:flex-shrink-0">
              {key}:
            </span>
            <span className="min-w-0 font-mono text-gray-800 dark:text-gray-200 break-all">
              {value === null || value === undefined ? (
                <span className="text-gray-400">—</span>
              ) : typeof value === 'object' ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-100 dark:bg-gray-900 p-2 text-xs">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                String(value)
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SnapshotView = memo(SnapshotViewComponent);

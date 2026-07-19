/**
 * DiffLine Component
 * Renders a single line in the diff viewer with appropriate styling
 */

import { memo } from 'react';
import { Plus, Minus, Equal } from 'lucide-react';
import type { DiffChangeType } from '../types';

interface DiffLineProps {
  content: string;
  type: DiffChangeType;
  lineNumber?: number;
  showLineNumber?: boolean;
  className?: string;
}

const typeStyles: Record<DiffChangeType, string> = {
  added: 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-l-4 border-green-500',
  removed: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-l-4 border-red-500',
  modified: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-l-4 border-yellow-500',
  unchanged: 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400',
};

const typeIcons: Record<DiffChangeType, typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Equal,
  unchanged: Equal,
};

function DiffLineComponent({
  content,
  type,
  lineNumber,
  showLineNumber = true,
  className = '',
}: DiffLineProps) {
  const Icon = typeIcons[type];

  return (
    <div
      className={`flex items-start font-mono text-sm ${typeStyles[type]} ${className}`}
    >
      {showLineNumber && lineNumber !== undefined && (
        <span className="flex-shrink-0 w-10 px-2 py-1 text-right text-xs text-gray-500 dark:text-gray-500 select-none border-r border-gray-200 dark:border-gray-700">
          {lineNumber}
        </span>
      )}
      <span className="flex-shrink-0 w-6 flex items-center justify-center py-1">
        {type !== 'unchanged' && (
          <Icon className="h-3 w-3" />
        )}
      </span>
      <pre className="flex-1 px-2 py-1 whitespace-pre-wrap break-all overflow-x-auto">
        {content || ' '}
      </pre>
    </div>
  );
}

export const DiffLine = memo(DiffLineComponent);

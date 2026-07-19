/**
 * FieldDiff Component
 * Renders field-level differences for JSON objects
 */

import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, RefreshCw } from 'lucide-react';
import type { DiffChange, DiffChangeType } from '../types';
import { formatValue } from '../utils/diffUtils';

interface FieldDiffProps {
  change: DiffChange;
  depth?: number;
  defaultExpanded?: boolean;
  className?: string;
}

const typeStyles: Record<DiffChangeType, { container: string; badge: string; icon: typeof Plus }> = {
  added: {
    container: 'border-l-2 border-green-500',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    icon: Plus,
  },
  removed: {
    container: 'border-l-2 border-red-500',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: Minus,
  },
  modified: {
    container: 'border-l-2 border-yellow-500',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: RefreshCw,
  },
  unchanged: {
    container: 'border-l-2 border-gray-300 dark:border-gray-600',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: RefreshCw,
  },
};

function FieldDiffComponent({
  change,
  depth = 0,
  defaultExpanded = true,
  className = '',
}: FieldDiffProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasChildren = change.children && change.children.length > 0;
  const style = typeStyles[change.type];
  const Icon = style.icon;

  const toggleExpanded = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  // Skip unchanged fields without children
  if (change.type === 'unchanged' && !hasChildren) {
    return null;
  }

  const paddingLeft = depth * 16;

  return (
    <div className={`${className}`}>
      <div
        className={`flex items-start gap-2 py-2 px-3 ${style.container} hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasChildren ? 'cursor-pointer' : ''}`}
        style={{ paddingLeft: `${paddingLeft + 12}px` }}
        onClick={toggleExpanded}
      >
        {/* Expand/Collapse Icon */}
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )
          ) : null}
        </span>

        {/* Type Badge */}
        {change.type !== 'unchanged' && (
          <span className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${style.badge}`}>
            <Icon className="h-3 w-3" />
            {change.type}
          </span>
        )}

        {/* Field Name */}
        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
          {change.field}
        </span>

        {/* Values */}
        {!hasChildren && (
          <div className="flex-1 flex items-center gap-2 font-mono text-sm overflow-hidden">
            {change.type === 'modified' && (
              <>
                <span className="text-red-600 dark:text-red-400 line-through truncate max-w-[200px]">
                  {formatValue(change.oldValue)}
                </span>
                <span className="text-gray-500">→</span>
                <span className="text-green-600 dark:text-green-400 truncate max-w-[200px]">
                  {formatValue(change.newValue)}
                </span>
              </>
            )}
            {change.type === 'added' && (
              <span className="text-green-600 dark:text-green-400 truncate">
                {formatValue(change.newValue)}
              </span>
            )}
            {change.type === 'removed' && (
              <span className="text-red-600 dark:text-red-400 line-through truncate">
                {formatValue(change.oldValue)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="border-l border-gray-200 dark:border-gray-700 ml-4">
          {change.children!.map((child, index) => (
            <FieldDiff
              key={`${child.field}-${index}`}
              change={child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const FieldDiff = memo(FieldDiffComponent);

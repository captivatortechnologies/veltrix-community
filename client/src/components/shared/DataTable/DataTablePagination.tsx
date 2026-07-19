import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DataTablePaginationState } from './types';

export interface DataTablePaginationProps {
  pagination: DataTablePaginationState;
  onPageChange?: (page: number) => void;
}

const NAV_BUTTON_CLASS = `
  inline-flex items-center justify-center rounded-md border border-border
  bg-surface-raised p-1.5 text-content-secondary transition-colors
  hover:bg-surface-hover hover:text-content-primary
  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-raised disabled:hover:text-content-secondary
  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
`;

/**
 * DataTablePagination
 *
 * Server-driven pagination footer: a "X–Y of Z" range label plus previous/next controls.
 * There is deliberately no page-number input — `total`/`pageSize` come from the server, so
 * the caller drives `page` via `onPageChange` and re-fetches.
 */
export const DataTablePagination: React.FC<DataTablePaginationProps> = ({ pagination, onPageChange }) => {
  const { page, pageSize, total } = pagination;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const canGoPrev = page > 1;
  const canGoNext = page < pageCount;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-sm text-content-secondary">
        {total === 0 ? 'No results' : `${rangeStart}–${rangeEnd} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!canGoPrev}
          onClick={() => onPageChange?.(page - 1)}
          className={NAV_BUTTON_CLASS}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={!canGoNext}
          onClick={() => onPageChange?.(page + 1)}
          className={NAV_BUTTON_CLASS}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

DataTablePagination.displayName = 'DataTablePagination';

export default DataTablePagination;

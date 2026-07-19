import React, { useId, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Select } from '../Select';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Renders a page-size `<Select>` when provided together with `pageSizeOptions`. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  disabled?: boolean;
  className?: string;
}

type PageToken = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * First + last page, plus up to one sibling on each side of `current`, collapsing any gap
 * into a single ellipsis token per side. Standard "1 … 4 5 6 … 20" range pagination.
 */
function buildPageTokens(current: number, pageCount: number): PageToken[] {
  const siblingCount = 1;

  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, pageCount);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < pageCount - 1;

  const tokens: PageToken[] = [1];
  if (showLeftEllipsis) tokens.push('ellipsis-start');
  for (let p = Math.max(leftSibling, 2); p <= Math.min(rightSibling, pageCount - 1); p += 1) {
    tokens.push(p);
  }
  if (showRightEllipsis) tokens.push('ellipsis-end');
  tokens.push(pageCount);
  return tokens;
}

const NAV_BUTTON_CLASS = `
  inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border
  bg-surface-raised text-content-secondary transition-colors
  hover:bg-surface-hover hover:text-content-primary
  disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-raised disabled:hover:text-content-secondary
  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
`;

const PAGE_BUTTON_BASE_CLASS = `
  inline-flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-md px-2 text-sm font-medium
  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
  disabled:cursor-not-allowed disabled:opacity-40
`;

/**
 * Pagination
 *
 * A standalone pager, visually and behaviorally consistent with DataTable's built-in
 * pagination footer (same "Showing X–Y of N" language and Prev/Next controls), extended with
 * numbered pages (ellipsis-collapsed for large ranges) and an optional page-size selector.
 * Purely presentational — like DataTable, it never derives its own state; the caller owns
 * `page` and re-fetches/re-slices in `onPageChange`.
 *
 * @example
 * <Pagination
 *   page={page}
 *   pageSize={pageSize}
 *   totalItems={total}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 *   pageSizeOptions={[10, 25, 50]}
 * />
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  disabled = false,
  className = '',
}) => {
  const pageSizeSelectId = useId();
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalItems);
  const tokens = useMemo(() => buildPageTokens(page, pageCount), [page, pageCount]);

  const goTo = (target: number) => {
    if (disabled || target < 1 || target > pageCount || target === page) return;
    onPageChange(target);
  };

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm text-content-secondary">
        {totalItems === 0 ? 'No results' : `Showing ${rangeStart}–${rangeEnd} of ${totalItems}`}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {onPageSizeChange && pageSizeOptions && pageSizeOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor={pageSizeSelectId} className="whitespace-nowrap text-sm text-content-secondary">
              Rows per page
            </label>
            <div className="w-20">
              <Select
                id={pageSizeSelectId}
                aria-label="Rows per page"
                value={String(pageSize)}
                onChange={(value) => onPageSizeChange(Number(value))}
                options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                disabled={disabled}
                fullWidth={false}
                size="sm"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={disabled || page <= 1}
            onClick={() => goTo(page - 1)}
            className={NAV_BUTTON_CLASS}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>

          {tokens.map((token) =>
            typeof token === 'number' ? (
              <button
                key={token}
                type="button"
                aria-current={token === page ? 'page' : undefined}
                disabled={disabled}
                onClick={() => goTo(token)}
                className={`${PAGE_BUTTON_BASE_CLASS} ${
                  token === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
                }`}
              >
                {token}
              </button>
            ) : (
              <span
                key={token}
                aria-hidden="true"
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center text-content-tertiary"
              >
                <MoreHorizontal size={16} />
              </span>
            )
          )}

          <button
            type="button"
            aria-label="Next page"
            disabled={disabled || page >= pageCount}
            onClick={() => goTo(page + 1)}
            className={NAV_BUTTON_CLASS}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
};

Pagination.displayName = 'Pagination';

export default Pagination;

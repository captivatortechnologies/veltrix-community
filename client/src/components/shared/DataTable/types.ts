import type { ReactNode } from 'react';

export type DataTableAlign = 'left' | 'center' | 'right';
export type DataTableSortOrder = 'asc' | 'desc';

export interface DataTableSort {
  field: string;
  order: DataTableSortOrder;
}

export interface DataTableColumn<T> {
  /** Stable column id; also the sort field passed to `onSortChange`. */
  key: string;
  header: ReactNode;
  /** Defaults to reading `row[key]` when omitted. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: DataTableAlign;
  /** A Tailwind width class (e.g. `'w-48'`) or a raw CSS width (e.g. `'12rem'`). */
  width?: string;
  className?: string;
}

export interface DataTableEmptyState {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export interface DataTablePaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Renders `pagination.pageSize` (or 5) skeleton rows in place of `data`. */
  isLoading?: boolean;
  /** Rendered via the shared `EmptyState` when `!isLoading && data.length === 0`. */
  emptyState?: DataTableEmptyState;
  sort?: DataTableSort;
  /** Called when a sortable header is clicked; toggles asc -> desc -> asc. */
  onSortChange?: (sort: DataTableSort) => void;
  /** Server-driven pagination; renders a footer with a range label + prev/next controls. */
  pagination?: DataTablePaginationState;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  /** Trailing cell for row-scoped actions; clicks inside never trigger `onRowClick`. */
  rowActions?: (row: T) => ReactNode;
  className?: string;
}

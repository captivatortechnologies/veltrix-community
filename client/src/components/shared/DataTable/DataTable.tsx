import { useCallback } from 'react';
import { EmptyState } from '../EmptyState';
import { DataTableHeaderCell } from './DataTableHeaderCell';
import { DataTableRow } from './DataTableRow';
import { DataTableSkeletonRow } from './DataTableSkeletonRow';
import { DataTablePagination } from './DataTablePagination';
import type { DataTableProps, DataTableSort } from './types';

const DEFAULT_SKELETON_ROW_COUNT = 5;

/**
 * DataTable
 *
 * The shared, server-driven data table primitive: columns describe how to render/sort each
 * field, and `data`/`sort`/`pagination` are simple snapshots of server state — this component
 * never sorts, paginates, or filters on its own. It only renders what it's given and reports
 * user intent back through `onSortChange` / `onPageChange` / `onRowClick`.
 *
 * Purely presentational: no services, routing, or app-level state — compose it from a
 * feature/page component that owns the actual data fetching.
 *
 * @example
 * <DataTable
 *   columns={[
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
 *   ]}
 *   data={vendors}
 *   rowKey={(row) => row.id}
 *   sort={sort}
 *   onSortChange={setSort}
 *   pagination={{ page, pageSize: 20, total }}
 *   onPageChange={setPage}
 *   onRowClick={(row) => navigate(`/vendors/${row.id}`)}
 *   rowActions={(row) => <Button size="sm" variant="ghost">Edit</Button>}
 * />
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  emptyState,
  sort,
  onSortChange,
  pagination,
  onPageChange,
  onRowClick,
  rowActions,
  className = '',
}: DataTableProps<T>) {
  const columnCount = columns.length + (rowActions ? 1 : 0);
  const showEmptyState = !isLoading && data.length === 0;
  const skeletonRowCount = pagination?.pageSize ?? DEFAULT_SKELETON_ROW_COUNT;

  const handleSort = useCallback(
    (field: string) => {
      if (!onSortChange) return;
      const isActive = sort?.field === field;
      const nextOrder: DataTableSort['order'] = isActive && sort?.order === 'asc' ? 'desc' : 'asc';
      onSortChange({ field, order: nextOrder });
    },
    [sort, onSortChange]
  );

  return (
    <div className={`w-full ${className}`}>
      {isLoading && (
        <span className="sr-only" role="status">
          Loading…
        </span>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
        <table className="w-full min-w-full divide-y divide-border text-left" aria-busy={isLoading || undefined}>
          <thead className="bg-surface-hover">
            <tr>
              {columns.map((column) => (
                <DataTableHeaderCell
                  key={column.key}
                  column={column}
                  sort={sort}
                  onSort={onSortChange ? handleSort : undefined}
                />
              ))}
              {rowActions && (
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {isLoading &&
              Array.from({ length: skeletonRowCount }).map((_, index) => (
                <DataTableSkeletonRow key={index} columnCount={columnCount} />
              ))}

            {showEmptyState && (
              <tr>
                <td colSpan={Math.max(columnCount, 1)}>
                  <EmptyState
                    icon={emptyState?.icon}
                    title={emptyState?.title ?? 'No data'}
                    description={emptyState?.description}
                    action={emptyState?.action}
                  />
                </td>
              </tr>
            )}

            {!isLoading &&
              !showEmptyState &&
              data.map((row) => (
                <DataTableRow
                  key={rowKey(row)}
                  row={row}
                  columns={columns}
                  onRowClick={onRowClick}
                  rowActions={rowActions}
                />
              ))}
          </tbody>
        </table>
      </div>

      {pagination && <DataTablePagination pagination={pagination} onPageChange={onPageChange} />}
    </div>
  );
}

DataTable.displayName = 'DataTable';

export default DataTable;

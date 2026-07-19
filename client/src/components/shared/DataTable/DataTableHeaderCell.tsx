import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { DataTableColumn, DataTableSort } from './types';
import { ALIGN_CLASS, resolveColumnWidth } from './utils';

export interface DataTableHeaderCellProps<T> {
  column: DataTableColumn<T>;
  sort?: DataTableSort;
  onSort?: (field: string) => void;
}

/**
 * DataTableHeaderCell
 *
 * A single `<th>` in the DataTable header row. Sortable columns render a real `<button>`
 * so the sort control is keyboard- and screen-reader-accessible, and expose the active sort
 * direction via `aria-sort` on the `<th>` itself per the WAI-ARIA table sort pattern.
 */
export function DataTableHeaderCell<T>({ column, sort, onSort }: DataTableHeaderCellProps<T>) {
  const align = column.align ?? 'left';
  const isSortable = !!column.sortable && !!onSort;
  const isActive = isSortable && sort?.field === column.key;
  const ariaSort = isSortable ? (isActive ? (sort!.order === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
  const { widthClassName, widthStyle } = resolveColumnWidth(column.width);

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      style={widthStyle ? { width: widthStyle } : undefined}
      className={`
        px-4 py-3 text-xs font-semibold uppercase tracking-wide text-content-secondary
        ${ALIGN_CLASS[align]} ${widthClassName} ${column.className ?? ''}
      `}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={() => onSort!(column.key)}
          className={`
            inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide
            text-content-secondary hover:text-content-primary
            rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
            ${align === 'right' ? 'flex-row-reverse' : ''}
          `}
        >
          <span>{column.header}</span>
          {isActive ? (
            sort!.order === 'asc' ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )
          ) : (
            <ChevronsUpDown size={14} className="text-content-tertiary" aria-hidden="true" />
          )}
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

export default DataTableHeaderCell;

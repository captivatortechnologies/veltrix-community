import { useCallback, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { DataTableColumn } from './types';
import { ALIGN_CLASS } from './utils';

export interface DataTableRowProps<T> {
  row: T;
  columns: DataTableColumn<T>[];
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
}

/**
 * DataTableRow
 *
 * A single `<tr>`. When `onRowClick` is provided the row becomes a keyboard-operable
 * button (`role="button"`, `tabIndex={0}`, Enter/Space activation) while remaining a
 * semantic `<tr>` so it still participates in the table's row/cell structure.
 *
 * The trailing `rowActions` cell stops click propagation so buttons/links rendered there
 * never bubble up and trigger `onRowClick`; the row's own keydown handler additionally
 * ignores events that originate on a descendant (e.g. a focused action button) so Enter/Space
 * pressed on an action doesn't *also* fire the row click.
 */
export function DataTableRow<T>({ row, columns, onRowClick, rowActions }: DataTableRowProps<T>) {
  const isClickable = !!onRowClick;

  const handleClick = useCallback(() => {
    onRowClick?.(row);
  }, [onRowClick, row]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (!isClickable) return;
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onRowClick?.(row);
      }
    },
    [isClickable, onRowClick, row]
  );

  const stopActionsClick = useCallback((event: MouseEvent<HTMLTableCellElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <tr
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : undefined}
      className={
        isClickable
          ? 'cursor-pointer transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
          : undefined
      }
    >
      {columns.map((column) => {
        const align = column.align ?? 'left';
        const value = column.render
          ? column.render(row)
          : ((row as unknown as Record<string, unknown>)[column.key] as ReactNode);
        return (
          <td
            key={column.key}
            className={`px-4 py-3 text-sm text-content-primary ${ALIGN_CLASS[align]} ${column.className ?? ''}`}
          >
            {value}
          </td>
        );
      })}
      {rowActions && (
        <td className="px-4 py-3 text-right text-sm" onClick={stopActionsClick}>
          {rowActions(row)}
        </td>
      )}
    </tr>
  );
}

export default DataTableRow;

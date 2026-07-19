import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DataTable from '../DataTable';
import type { DataTableColumn, DataTableProps } from '../types';

interface Vendor {
  id: string;
  name: string;
  status: string;
}

const vendors: Vendor[] = [
  { id: '1', name: 'Splunk', status: 'Active' },
  { id: '2', name: 'CrowdStrike', status: 'Active' },
  { id: '3', name: 'Okta', status: 'Inactive' },
];

const columns: DataTableColumn<Vendor>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'status', header: 'Status' },
];

const renderTable = (overrides: Partial<DataTableProps<Vendor>> = {}) =>
  render(
    <DataTable
      columns={columns}
      data={vendors}
      rowKey={(row) => row.id}
      {...overrides}
    />
  );

describe('DataTable', () => {
  it('renders column headers and row data', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByText('Splunk')).toBeInTheDocument();
    expect(screen.getByText('CrowdStrike')).toBeInTheDocument();
    expect(screen.getByText('Okta')).toBeInTheDocument();
    // header row + one row per vendor
    expect(screen.getAllByRole('row')).toHaveLength(vendors.length + 1);
  });

  it('defaults a column without render to the raw field value', () => {
    renderTable();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('uses a column render function when provided instead of the default', () => {
    const columnsWithRender: DataTableColumn<Vendor>[] = [
      ...columns,
      {
        key: 'custom',
        header: 'Custom',
        render: (row) => <span data-testid={`custom-${row.id}`}>{row.name.toUpperCase()}</span>,
      },
    ];
    renderTable({ columns: columnsWithRender });

    expect(screen.getByTestId('custom-1')).toHaveTextContent('SPLUNK');
  });

  it('does not render a sort button for non-sortable columns', () => {
    renderTable({ onSortChange: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('reports asc on first click of a sortable header, and marks it via aria-sort', () => {
    const handleSortChange = vi.fn();
    renderTable({ onSortChange: handleSortChange });

    fireEvent.click(screen.getByRole('button', { name: /Name/i }));
    expect(handleSortChange).toHaveBeenCalledWith({ field: 'name', order: 'asc' });
  });

  it('toggles asc -> desc -> asc on repeated clicks of the active sorted header', () => {
    const handleSortChange = vi.fn();
    const { rerender } = renderTable({
      sort: { field: 'name', order: 'asc' },
      onSortChange: handleSortChange,
    });

    expect(screen.getByRole('columnheader', { name: /Name/i })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByRole('button', { name: /Name/i }));
    expect(handleSortChange).toHaveBeenCalledWith({ field: 'name', order: 'desc' });

    rerender(
      <DataTable
        columns={columns}
        data={vendors}
        rowKey={(row) => row.id}
        sort={{ field: 'name', order: 'desc' }}
        onSortChange={handleSortChange}
      />
    );
    expect(screen.getByRole('columnheader', { name: /Name/i })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: /Name/i }));
    expect(handleSortChange).toHaveBeenLastCalledWith({ field: 'name', order: 'asc' });
  });

  it('sets aria-sort="none" on an inactive sortable column and omits it on non-sortable columns', () => {
    renderTable({ onSortChange: vi.fn() });
    expect(screen.getByRole('columnheader', { name: /Name/i })).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute('aria-sort');
  });

  it('renders the pagination range text and enables/disables prev/next at the bounds', () => {
    const handlePageChange = vi.fn();
    renderTable({
      pagination: { page: 1, pageSize: 20, total: 143 },
      onPageChange: handlePageChange,
    });

    expect(screen.getByText('1–20 of 143')).toBeInTheDocument();

    const prevButton = screen.getByRole('button', { name: 'Previous page' });
    const nextButton = screen.getByRole('button', { name: 'Next page' });
    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('disables the next button and shows the trailing range on the last page', () => {
    renderTable({ pagination: { page: 8, pageSize: 20, total: 143 } });

    expect(screen.getByText('141–143 of 143')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).not.toBeDisabled();
  });

  it('does not render a pagination footer when pagination is not provided', () => {
    renderTable();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('renders skeleton rows instead of data while loading', () => {
    const { container } = renderTable({
      data: [],
      isLoading: true,
      pagination: { page: 1, pageSize: 5, total: 0 },
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(screen.queryByText('Splunk')).not.toBeInTheDocument();
  });

  it('falls back to 5 skeleton rows when no pagination is provided', () => {
    const { container } = renderTable({ data: [], isLoading: true });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });

  it('renders the shared EmptyState when there is no data and it is not loading', () => {
    renderTable({
      data: [],
      emptyState: { title: 'No vendors found', description: 'Try adjusting your filters.' },
    });

    expect(screen.getByText('No vendors found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('falls back to a default empty title when emptyState is not provided', () => {
    renderTable({ data: [] });
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('does not render an empty state while loading, even with no data', () => {
    renderTable({ data: [], isLoading: true, emptyState: { title: 'No vendors found' } });
    expect(screen.queryByText('No vendors found')).not.toBeInTheDocument();
  });

  it('marks clickable rows as keyboard-focusable buttons and calls onRowClick on click', () => {
    const handleRowClick = vi.fn();
    renderTable({ onRowClick: handleRowClick });

    const splunkRow = screen.getByText('Splunk').closest('tr');
    expect(splunkRow).toHaveAttribute('role', 'button');
    expect(splunkRow).toHaveAttribute('tabIndex', '0');

    fireEvent.click(splunkRow as HTMLElement);
    expect(handleRowClick).toHaveBeenCalledWith(vendors[0]);
  });

  it('activates a row via Enter and Space keydown', () => {
    const handleRowClick = vi.fn();
    renderTable({ onRowClick: handleRowClick });

    const oktaRow = screen.getByText('Okta').closest('tr') as HTMLElement;

    fireEvent.keyDown(oktaRow, { key: 'Enter' });
    expect(handleRowClick).toHaveBeenCalledWith(vendors[2]);

    handleRowClick.mockClear();
    fireEvent.keyDown(oktaRow, { key: ' ' });
    expect(handleRowClick).toHaveBeenCalledWith(vendors[2]);
  });

  it('does not mark rows as clickable/focusable when onRowClick is not provided', () => {
    renderTable();
    const splunkRow = screen.getByText('Splunk').closest('tr');
    expect(splunkRow).not.toHaveAttribute('role', 'button');
    expect(splunkRow).not.toHaveAttribute('tabindex');
  });

  it('renders rowActions in a trailing cell without triggering onRowClick on click', () => {
    const handleRowClick = vi.fn();
    renderTable({
      onRowClick: handleRowClick,
      rowActions: (row) => <button>{`Edit ${row.name}`}</button>,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Splunk' }));
    expect(handleRowClick).not.toHaveBeenCalled();
  });

  it('does not trigger onRowClick when Enter is pressed on a rowActions control', () => {
    const handleRowClick = vi.fn();
    renderTable({
      onRowClick: handleRowClick,
      rowActions: (row) => <button>{`Edit ${row.name}`}</button>,
    });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit Splunk' }), { key: 'Enter' });
    expect(handleRowClick).not.toHaveBeenCalled();
  });
});

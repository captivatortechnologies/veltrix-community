import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Pagination from '../Pagination';

describe('Pagination', () => {
  it('renders the "Showing X–Y of N" summary', () => {
    render(<Pagination page={2} pageSize={10} totalItems={35} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 11–20 of 35')).toBeInTheDocument();
  });

  it('renders "No results" when totalItems is 0', () => {
    render(<Pagination page={1} pageSize={10} totalItems={0} onPageChange={vi.fn()} />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('is wrapped in a nav landmark labeled "Pagination"', () => {
    render(<Pagination page={1} pageSize={10} totalItems={35} onPageChange={vi.fn()} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last page', () => {
    const { rerender } = render(<Pagination page={1} pageSize={10} totalItems={35} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled();

    rerender(<Pagination page={4} pageSize={10} totalItems={35} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('calls onPageChange with the next/previous page', () => {
    const handlePageChange = vi.fn();
    render(<Pagination page={2} pageSize={10} totalItems={35} onPageChange={handlePageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(handlePageChange).toHaveBeenCalledWith(1);
  });

  it('marks the active page with aria-current="page" and calls onPageChange when a page number is clicked', () => {
    const handlePageChange = vi.fn();
    render(<Pagination page={2} pageSize={10} totalItems={35} onPageChange={handlePageChange} />);

    const activePage = screen.getByRole('button', { name: '2' });
    expect(activePage).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('collapses large ranges with an ellipsis', () => {
    render(<Pagination page={10} pageSize={10} totalItems={500} onPageChange={vi.fn()} />);
    // 50 total pages, current = 10: expect the first/last page and the immediate neighbors
    // of the current page, but NOT every page in between (collapsed behind an ellipsis).
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });

  it('renders a page-size selector when onPageSizeChange + pageSizeOptions are provided, and calls it on change', () => {
    const handlePageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={10}
        totalItems={100}
        onPageChange={vi.fn()}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 25, 50]}
      />
    );
    const select = screen.getByRole('combobox', { name: 'Rows per page' });
    expect(select).toHaveTextContent('10');

    fireEvent.click(select);
    fireEvent.click(screen.getByText('25'));
    expect(handlePageSizeChange).toHaveBeenCalledWith(25);
  });

  it('omits the page-size selector when onPageSizeChange/pageSizeOptions are not both provided', () => {
    render(<Pagination page={1} pageSize={10} totalItems={100} onPageChange={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Rows per page' })).not.toBeInTheDocument();
  });

  it('disables all interactive controls when disabled is true', () => {
    render(
      <Pagination page={2} pageSize={10} totalItems={35} onPageChange={vi.fn()} disabled />
    );
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
  });
});

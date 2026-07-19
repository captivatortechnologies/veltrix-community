import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FilterBar, { type FilterDefinition } from '../FilterBar';

const vendorOptions = [
  { value: 'splunk', label: 'Splunk' },
  { value: 'crowdstrike', label: 'CrowdStrike' },
];
const categoryOptions = [
  { value: 'siem', label: 'SIEM' },
  { value: 'edr', label: 'EDR' },
];

function makeFilters(overrides?: Partial<Record<'vendor' | 'category', Partial<FilterDefinition>>>): {
  filters: FilterDefinition[];
  onVendorChange: ReturnType<typeof vi.fn>;
  onCategoryChange: ReturnType<typeof vi.fn>;
} {
  const onVendorChange = vi.fn();
  const onCategoryChange = vi.fn();
  const filters: FilterDefinition[] = [
    {
      key: 'vendor',
      label: 'Vendor',
      options: vendorOptions,
      value: null,
      onChange: onVendorChange,
      alwaysVisible: true,
      ...overrides?.vendor,
    },
    {
      key: 'category',
      label: 'Category',
      options: categoryOptions,
      value: null,
      onChange: onCategoryChange,
      ...overrides?.category,
    },
  ];
  return { filters, onVendorChange, onCategoryChange };
}

describe('FilterBar', () => {
  it('always renders alwaysVisible filters', () => {
    const { filters } = makeFilters();
    render(<FilterBar filters={filters} />);
    expect(screen.getByRole('combobox', { name: 'Vendor' })).toBeInTheDocument();
  });

  it('hides optional filters until added, and shows them in the "Add filter" menu', () => {
    const { filters } = makeFilters();
    render(<FilterBar filters={filters} />);

    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('adds an optional filter\'s dropdown when picked from the "Add filter" menu', () => {
    const { filters } = makeFilters();
    render(<FilterBar filters={filters} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    fireEvent.click(screen.getByText('Category'));

    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Category filter' })).toBeInTheDocument();
  });

  it('treats an optional filter with a non-null value as already visible, without requiring "Add filter"', () => {
    const { filters } = makeFilters({ category: { value: 'siem' } });
    render(<FilterBar filters={filters} />);
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
  });

  it('removing an optional filter hides its dropdown and clears its value', () => {
    const { filters, onCategoryChange } = makeFilters({ category: { value: 'siem' } });
    render(<FilterBar filters={filters} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Category filter' }));

    expect(onCategoryChange).toHaveBeenCalledWith(null);
  });

  it('selecting an option calls the filter\'s onChange with the value', () => {
    const { filters, onVendorChange } = makeFilters();
    render(<FilterBar filters={filters} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Vendor' }));
    fireEvent.click(screen.getByText('CrowdStrike'));

    expect(onVendorChange).toHaveBeenCalledWith('crowdstrike');
  });

  it('shows "Clear all" only once a filter has a value, and clears every filter on click', () => {
    const { filters, onVendorChange } = makeFilters();
    const { rerender } = render(<FilterBar filters={filters} />);
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();

    const filtersWithValue = filters.map((f) => (f.key === 'vendor' ? { ...f, value: 'splunk' } : f));
    rerender(<FilterBar filters={filtersWithValue} />);

    const clearAll = screen.getByRole('button', { name: 'Clear all' });
    fireEvent.click(clearAll);
    expect(onVendorChange).toHaveBeenCalledWith(null);
  });

  it('calls onClearAll instead of per-filter onChange when provided', () => {
    const { filters, onVendorChange } = makeFilters({ vendor: { value: 'splunk' } });
    const handleClearAll = vi.fn();
    render(<FilterBar filters={filters} onClearAll={handleClearAll} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(handleClearAll).toHaveBeenCalledTimes(1);
    expect(onVendorChange).not.toHaveBeenCalled();
  });

  it('renders the search box and forwards typed text to search.onChange', () => {
    const handleSearchChange = vi.fn();
    const { filters } = makeFilters();
    render(<FilterBar filters={filters} search={{ value: '', onChange: handleSearchChange, placeholder: 'Search apps…' }} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search apps…' }), { target: { value: 'okta' } });
    expect(handleSearchChange).toHaveBeenCalledWith('okta');
  });

  it('supports a custom addFilterLabel', () => {
    const { filters } = makeFilters();
    render(<FilterBar filters={filters} addFilterLabel="More filters" />);
    expect(screen.getByRole('button', { name: 'More filters' })).toBeInTheDocument();
  });
});

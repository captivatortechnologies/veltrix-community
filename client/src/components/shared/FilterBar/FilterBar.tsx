import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Select } from '../Select';
import { SearchBox } from '../SearchBox';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  /** Stable identifier; also the React key for this filter's dropdown. */
  key: string;
  /** Shown as the dropdown's placeholder/aria-label, and as its entry in the "Add filter" menu. */
  label: string;
  options: FilterOption[];
  /** `null` (not `''`) represents "no selection" — the value FilterBar clears back to. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Always rendered when true. Omit/false to make this filter addable/removable via the "Add filter" menu. */
  alwaysVisible?: boolean;
}

export interface FilterBarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface FilterBarProps {
  filters: FilterDefinition[];
  /** Renders a `SearchBox` ahead of the filter dropdowns when provided. */
  search?: FilterBarSearchProps;
  /**
   * Called by "Clear all" instead of FilterBar's own clearing logic. Omit it to let FilterBar
   * clear every filter with a value itself (`filter.onChange(null)` for each) — pass this only
   * when clearing needs to be coordinated with other state (e.g. also resetting a page number).
   */
  onClearAll?: () => void;
  addFilterLabel?: string;
  className?: string;
}

const REMOVE_BUTTON_CLASS = `
  inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md
  text-content-tertiary transition-colors
  hover:bg-surface-hover hover:text-content-primary
  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
`;

interface FilterDropdownProps {
  filter: FilterDefinition;
  onRemove?: () => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ filter, onRemove }) => (
  <div className="flex items-center gap-1">
    <div className="w-40">
      <Select
        aria-label={filter.label}
        placeholder={filter.label}
        value={filter.value ?? ''}
        onChange={(value) => filter.onChange(value === '' ? null : value)}
        options={filter.options}
        size="sm"
      />
    </div>
    {onRemove && (
      <button type="button" onClick={onRemove} aria-label={`Remove ${filter.label} filter`} className={REMOVE_BUTTON_CLASS}>
        <X size={14} aria-hidden="true" />
      </button>
    )}
  </div>
);

interface AddFilterMenuProps {
  label: string;
  hidden: FilterDefinition[];
  onAdd: (key: string) => void;
}

const AddFilterMenu: React.FC<AddFilterMenuProps> = ({ label, hidden, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className="
          inline-flex items-center gap-1.5 rounded-md border border-dashed border-border
          px-3 py-1.5 text-sm font-medium text-content-secondary transition-colors
          hover:border-solid hover:bg-surface-hover hover:text-content-primary
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
        "
      >
        <Plus size={14} aria-hidden="true" />
        {label}
      </button>

      {isOpen && (
        <div
          id={menuId}
          className="absolute z-20 mt-1 min-w-[10rem] rounded-md border border-border bg-surface-overlay py-1 shadow-lg"
        >
          {hidden.length === 0 ? (
            <p className="px-3 py-2 text-sm text-content-tertiary">No more filters</p>
          ) : (
            hidden.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => {
                  onAdd(filter.key);
                  setIsOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-content-primary hover:bg-primary-subtle focus:outline-none focus-visible:bg-primary-subtle"
              >
                {filter.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

/**
 * FilterBar
 *
 * A row of dropdown filters that can be added or hidden: always-visible filters render
 * unconditionally, while optional filters stay tucked behind an "Add filter" menu until the
 * user activates them (or the caller restores one with a value already set — e.g. from a URL
 * query string — which FilterBar treats as visible without requiring an explicit "add").
 * Generalizes the search box + "All Vendors"/"All Categories" dropdowns pattern from
 * /installed-apps into a reusable, fully generic control.
 *
 * FilterBar manages its own "which optional filters are showing" state; it never owns filter
 * *values* — every value and its setter stay with the caller via `FilterDefinition.onChange`.
 *
 * @example
 * <FilterBar
 *   search={{ value: search, onChange: setSearch, placeholder: 'Search apps…' }}
 *   filters={[
 *     { key: 'vendor', label: 'Vendor', options: vendorOptions, value: vendor, onChange: setVendor, alwaysVisible: true },
 *     { key: 'category', label: 'Category', options: categoryOptions, value: category, onChange: setCategory },
 *   ]}
 * />
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  search,
  onClearAll,
  addFilterLabel = 'Add filter',
  className = '',
}) => {
  const alwaysVisibleFilters = useMemo(() => filters.filter((f) => f.alwaysVisible), [filters]);
  const optionalFilters = useMemo(() => filters.filter((f) => !f.alwaysVisible), [filters]);

  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());

  const visibleOptionalFilters = useMemo(
    () => optionalFilters.filter((f) => addedKeys.has(f.key) || f.value !== null),
    [optionalFilters, addedKeys]
  );
  const hiddenOptionalFilters = useMemo(
    () => optionalFilters.filter((f) => !addedKeys.has(f.key) && f.value === null),
    [optionalFilters, addedKeys]
  );

  const hasAnyValue = filters.some((f) => f.value !== null);

  const handleAdd = useCallback((key: string) => {
    setAddedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const handleRemove = useCallback((filter: FilterDefinition) => {
    setAddedKeys((prev) => {
      if (!prev.has(filter.key)) return prev;
      const next = new Set(prev);
      next.delete(filter.key);
      return next;
    });
    filter.onChange(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setAddedKeys(new Set());
    if (onClearAll) {
      onClearAll();
      return;
    }
    filters.forEach((filter) => {
      if (filter.value !== null) filter.onChange(null);
    });
  }, [filters, onClearAll]);

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {search && (
        <div className="w-full max-w-xs sm:w-56">
          <SearchBox value={search.value} onChange={search.onChange} placeholder={search.placeholder} size="sm" />
        </div>
      )}

      {alwaysVisibleFilters.map((filter) => (
        <FilterDropdown key={filter.key} filter={filter} />
      ))}

      {visibleOptionalFilters.map((filter) => (
        <FilterDropdown key={filter.key} filter={filter} onRemove={() => handleRemove(filter)} />
      ))}

      {optionalFilters.length > 0 && (
        <AddFilterMenu label={addFilterLabel} hidden={hiddenOptionalFilters} onAdd={handleAdd} />
      )}

      {hasAnyValue && (
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded text-sm font-medium text-content-secondary underline-offset-2 hover:text-content-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear all
        </button>
      )}
    </div>
  );
};

FilterBar.displayName = 'FilterBar';

export default FilterBar;

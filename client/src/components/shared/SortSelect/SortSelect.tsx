import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Select } from '../Select';

export type SortDirection = 'asc' | 'desc';

export interface SortOption {
  value: string;
  label: string;
}

export interface SortSelectProps {
  /** Sortable fields, e.g. `[{ value: 'name', label: 'Name' }, { value: 'updatedAt', label: 'Updated' }]`. */
  options: SortOption[];
  /** Selected field key. */
  value: string;
  direction: SortDirection;
  /** Called with the field and direction together, whichever one the interaction changed. */
  onChange: (value: string, direction: SortDirection) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * SortSelect
 *
 * The standalone toolbar sort control for list/card surfaces that aren't a DataTable (which
 * already has its own column-header sort) — a labeled field `<Select>` paired with an
 * asc/desc direction toggle. Sized and spaced to sit in the same row as FilterBar.
 *
 * @example
 * <SortSelect
 *   options={[{ value: 'name', label: 'Name' }, { value: 'updatedAt', label: 'Last updated' }]}
 *   value={sortField}
 *   direction={sortDirection}
 *   onChange={(field, direction) => { setSortField(field); setSortDirection(direction); }}
 * />
 */
export const SortSelect: React.FC<SortSelectProps> = ({
  options,
  value,
  direction,
  onChange,
  disabled = false,
  className = '',
}) => {
  const directionLabel = direction === 'asc' ? 'Sort ascending' : 'Sort descending';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="w-44">
        <Select
          aria-label="Sort by"
          placeholder="Sort by…"
          value={value}
          onChange={(nextValue) => onChange(nextValue, direction)}
          options={options}
          size="sm"
          disabled={disabled}
          fullWidth={false}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(value, direction === 'asc' ? 'desc' : 'asc')}
        disabled={disabled}
        aria-label={directionLabel}
        title={directionLabel}
        className="
          inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border
          bg-surface-raised text-content-secondary transition-colors
          hover:bg-surface-hover hover:text-content-primary
          disabled:cursor-not-allowed disabled:opacity-40
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
        "
      >
        {direction === 'asc' ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
      </button>
    </div>
  );
};

SortSelect.displayName = 'SortSelect';

export default SortSelect;

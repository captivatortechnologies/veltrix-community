import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export type SearchBoxSize = 'sm' | 'md' | 'lg';

export interface SearchBoxProps {
  /** Controlled search text. */
  value: string;
  /** Called with the new text — debounced by `debounceMs` when set. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: SearchBoxSize;
  /** Debounces `onChange` by this many ms; omit (or `0`) to call on every keystroke. */
  debounceMs?: number;
  className?: string;
  'aria-label'?: string;
}

const sizeStyles: Record<SearchBoxSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

const iconSize: Record<SearchBoxSize, number> = { sm: 14, md: 16, lg: 18 };

/**
 * SearchBox
 *
 * A controlled free-text search input with a leading search icon and a clear (×) button that
 * appears once there's text — generalizes the inline search field on /installed-apps for
 * reuse anywhere a config-list surface needs free-text filtering.
 *
 * Debounces its own `onChange` when `debounceMs` is set, so a caller wired straight to a
 * network fetch or client-side filter doesn't need to hand-roll debouncing. The clear button
 * always resets immediately regardless of `debounceMs` — an explicit clear is a deliberate
 * action, not typing to be settled.
 *
 * @example
 * <SearchBox
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Search by name, vendor, or category…"
 *   debounceMs={250}
 * />
 */
export const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  placeholder = 'Search…',
  disabled = false,
  size = 'md',
  debounceMs = 0,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Follow external changes to `value` (e.g. a parent's "Clear all" action) — but not while
  // our own debounce timer is pending, or we'd stomp what the user just typed with the
  // not-yet-committed value.
  useEffect(() => {
    if (debounceTimeoutRef.current) return;
    setLocalValue(value);
  }, [value]);

  useEffect(
    () => () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    },
    []
  );

  const commit = useCallback(
    (next: string) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = undefined;
      }
      if (debounceMs > 0) {
        debounceTimeoutRef.current = setTimeout(() => {
          debounceTimeoutRef.current = undefined;
          onChangeRef.current(next);
        }, debounceMs);
      } else {
        onChangeRef.current(next);
      }
    },
    [debounceMs]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setLocalValue(next);
    commit(next);
  };

  const handleClear = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = undefined;
    }
    setLocalValue('');
    onChangeRef.current('');
  };

  const showClear = localValue.length > 0 && !disabled;

  return (
    <div className={`relative w-full ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search size={iconSize[size]} className="text-content-tertiary" aria-hidden="true" />
      </div>

      <input
        type="search"
        role="searchbox"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        className={`
          block w-full rounded-md border border-border
          bg-surface-raised text-content-primary placeholder-content-tertiary
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          disabled:bg-surface-sunken disabled:cursor-not-allowed disabled:text-content-disabled
          ${sizeStyles[size]}
          pl-10
          ${showClear ? 'pr-10' : ''}
        `}
      />

      {showClear && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="text-content-tertiary hover:text-content-primary focus:outline-none focus-visible:text-primary"
          >
            <X size={iconSize[size]} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

SearchBox.displayName = 'SearchBox';

export default SearchBox;

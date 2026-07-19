import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export type MultiSelectSize = 'sm' | 'md' | 'lg';

export interface MultiSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Currently selected values. */
  value?: string[];
  /** Called with the new list of selected values. */
  onChange?: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  size?: MultiSelectSize;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Show a filter box inside the dropdown. Defaults to true. */
  searchable?: boolean;
  /** How many selected chips to show in the trigger before collapsing to "+N more". Defaults to 3. */
  maxTagCount?: number;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

const sizeStyles: Record<MultiSelectSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

/**
 * MultiSelect Component
 *
 * An accessible, searchable multi-selection dropdown (WAI-ARIA listbox with
 * `aria-multiselectable`) — the multi-value counterpart to `Select`. Selected
 * values render as removable chips in the trigger; the popup lists checkbox
 * options with an optional filter box (essential for long lists such as
 * environments) plus select-all / clear affordances.
 *
 * The popup is rendered in a portal (document.body) with fixed positioning so
 * it floats above any overflow/scroll container (e.g. a modal) instead of being
 * clipped. All color/spacing come from design tokens (src/styles/tokens.css).
 *
 * @example
 * <MultiSelect
 *   label="Environments"
 *   value={selectedIds}
 *   onChange={setSelectedIds}
 *   placeholder="Select environments…"
 *   options={envs.map((e) => ({ value: e.id, label: e.name }))}
 * />
 */
export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  error,
  helperText,
  size = 'md',
  disabled = false,
  fullWidth = true,
  searchable = true,
  maxTagCount = 3,
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
}) => {
  const selected = useMemo(() => value ?? [], [value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = spaceBelow < 300 && rect.top > spaceBelow;
    setMenuPos({
      left: rect.left,
      width: rect.width,
      top: dropUp ? undefined : rect.bottom + 4,
      bottom: dropUp ? window.innerHeight - rect.top + 4 : undefined,
    });
  }, []);

  const generatedId = useId();
  const triggerId = id || `multiselect-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const descriptionId = error || helperText ? `${triggerId}-description` : undefined;

  const variant = error ? 'error' : 'default';
  const variantStyles: Record<'default' | 'error', string> = {
    default: 'border-border focus-visible:ring-primary focus-visible:border-primary',
    error: 'border-danger focus-visible:ring-danger focus-visible:border-danger',
  };

  const optionByValue = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const option of options) map.set(option.value, option);
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  const openList = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
  }, [disabled]);

  const closeList = useCallback((focusTrigger = true) => {
    setIsOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const toggleValue = useCallback(
    (optionValue: string) => {
      const option = optionByValue.get(optionValue);
      if (option?.disabled) return;
      const next = selectedSet.has(optionValue)
        ? selected.filter((v) => v !== optionValue)
        : [...selected, optionValue];
      onChange?.(next);
    },
    [optionByValue, selectedSet, selected, onChange],
  );

  const selectAllFiltered = useCallback(() => {
    const next = new Set(selected);
    for (const option of filteredOptions) {
      if (!option.disabled) next.add(option.value);
    }
    onChange?.(Array.from(next));
  }, [filteredOptions, selected, onChange]);

  const clearAll = useCallback(() => onChange?.([]), [onChange]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (isOpen && searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen, searchable]);

  // Close on outside click (the panel is portaled, so check it too).
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inContainer = containerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inContainer && !inPanel) closeList(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, closeList]);

  // Keep the portaled panel anchored to the trigger while open.
  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handle = () => updateMenuPosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isOpen, updateMenuPosition]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        if (!isOpen) {
          event.preventDefault();
          openList();
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          closeList();
        }
        break;
      default:
        break;
    }
  };

  const shownChips = selected.slice(0, maxTagCount);
  const overflowCount = selected.length - shownChips.length;

  return (
    <div ref={containerRef} className={`${fullWidth ? 'w-full' : ''} relative`}>
      {label && (
        <label htmlFor={triggerId} className="block text-sm font-medium text-content-primary mb-1">
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        name={name}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-invalid={!!error || undefined}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => (isOpen ? closeList() : openList())}
        onKeyDown={handleTriggerKeyDown}
        className={`
          flex items-center justify-between gap-2
          w-full rounded-md border
          bg-surface-raised text-content-primary
          transition-colors duration-200
          focus:outline-none focus-visible:ring-2
          disabled:bg-surface-sunken disabled:text-content-disabled disabled:cursor-not-allowed
          ${sizeStyles[size]}
          ${variantStyles[variant]}
          ${className}
        `}
      >
        <span className="flex flex-1 flex-wrap items-center gap-1 overflow-hidden text-left">
          {selected.length === 0 && <span className="text-content-tertiary">{placeholder}</span>}
          {shownChips.map((v) => {
            const option = optionByValue.get(v);
            return (
              <span
                key={v}
                className="inline-flex max-w-[12rem] items-center gap-1 rounded bg-primary-subtle px-1.5 py-0.5 text-xs text-primary-subtle-foreground"
              >
                <span className="truncate">{option?.label ?? v}</span>
                {!disabled && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${option?.label ?? v}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleValue(v);
                    }}
                    className="flex-shrink-0 rounded hover:bg-primary/20"
                  >
                    <X size={12} aria-hidden="true" />
                  </span>
                )}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span className="text-xs text-content-tertiary">+{overflowCount} more</span>
          )}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`flex-shrink-0 text-content-tertiary transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 1000,
          }}
          className="rounded-md border border-border bg-surface-overlay shadow-lg"
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search size={14} aria-hidden="true" className="flex-shrink-0 text-content-tertiary" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter options"
                className="w-full bg-transparent text-sm text-content-primary outline-none placeholder:text-content-tertiary"
              />
            </div>
          )}

          <div className="flex items-center justify-between px-2.5 py-1.5 text-xs text-content-tertiary">
            <span>{selected.length} selected</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="rounded px-1 py-0.5 hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Select {query ? 'filtered' : 'all'}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded px-1 py-0.5 hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Clear
              </button>
            </span>
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label || ariaLabel || placeholder}
            className="max-h-60 overflow-auto border-t border-border py-1"
          >
            {filteredOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-content-tertiary">No matches</li>
            )}
            {filteredOptions.map((option) => {
              const isSelected = selectedSet.has(option.value);
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onClick={() => toggleValue(option.value)}
                  className={`
                    flex items-center gap-2 px-3 py-2 text-sm
                    ${option.disabled ? 'cursor-not-allowed text-content-disabled' : 'cursor-pointer text-content-primary hover:bg-primary-subtle'}
                  `}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                      isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check size={12} />}
                  </span>
                  <span className="truncate">{option.label}</span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}

      {error && (
        <p id={descriptionId} className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={descriptionId} className="mt-1 text-sm text-content-secondary">
          {helperText}
        </p>
      )}
    </div>
  );
};

MultiSelect.displayName = 'MultiSelect';

export default MultiSelect;

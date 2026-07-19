import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  /** Currently selected value. Pass `''` or `undefined` to show the placeholder. */
  value?: string;
  /** Called with the newly selected option's value. */
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  size?: SelectSize;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

const sizeStyles: Record<SelectSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

/**
 * Select Component
 *
 * An accessible, keyboard-navigable dropdown to replace native `<select>` elements —
 * native selects can't be styled consistently across browsers/themes, which is exactly
 * the inconsistency this design system is meant to eliminate.
 *
 * Implements the WAI-ARIA listbox pattern (trigger button + popup listbox, not a native
 * `<select>`) so light/dark theming is fully under our control:
 *   - `Enter` / `Space` / `ArrowDown` / `ArrowUp` open the list when closed
 *   - `ArrowUp` / `ArrowDown` move the highlighted option once open
 *   - `Home` / `End` jump to the first/last enabled option
 *   - typing jumps to the next option starting with the typed characters (typeahead)
 *   - `Enter` / `Space` commits the highlighted option, `Escape` closes without changing it
 *   - clicking outside closes the list without changing the value
 *
 * All color/spacing/typography come from design tokens (src/styles/tokens.css) — no
 * `dark:` prefixes needed for brand color, no hardcoded hex/palette classes.
 *
 * @example
 * <Select
 *   label="Vendor"
 *   value={vendorFilter}
 *   onChange={setVendorFilter}
 *   placeholder="All Vendors"
 *   options={vendors.map((v) => ({ value: v, label: v }))}
 * />
 */
export const Select: React.FC<SelectProps> = ({
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
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const typeaheadRef = useRef('');
  const typeaheadTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  // The open listbox is rendered in a portal (document.body) with fixed
  // positioning so it floats ABOVE any overflow/scroll container (e.g. a modal)
  // instead of being clipped inside it. `menuPos` anchors it to the trigger.
  const [menuPos, setMenuPos] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
  } | null>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // Drop upward when there isn't room below but there is above.
    const dropUp = spaceBelow < 260 && rect.top > spaceBelow;
    setMenuPos({
      left: rect.left,
      width: rect.width,
      top: dropUp ? undefined : rect.bottom + 4,
      bottom: dropUp ? window.innerHeight - rect.top + 4 : undefined,
    });
  }, []);

  const generatedId = useId();
  const triggerId = id || `select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const descriptionId = error || helperText ? `${triggerId}-description` : undefined;

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const variant = error ? 'error' : 'default';
  const variantStyles: Record<'default' | 'error', string> = {
    default: 'border-border focus-visible:ring-primary focus-visible:border-primary',
    error: 'border-danger focus-visible:ring-danger focus-visible:border-danger',
  };

  const firstEnabledIndex = options.findIndex((o) => !o.disabled);
  const lastEnabledIndex = (() => {
    for (let i = options.length - 1; i >= 0; i -= 1) {
      if (!options[i].disabled) return i;
    }
    return -1;
  })();

  const openList = useCallback(
    (initialIndex?: number) => {
      if (disabled || options.length === 0) return;
      setIsOpen(true);
      setActiveIndex(initialIndex ?? (selectedIndex >= 0 ? selectedIndex : firstEnabledIndex));
    },
    [disabled, options.length, selectedIndex, firstEnabledIndex]
  );

  const closeList = useCallback((focusTrigger = true) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const commitSelection = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange?.(option.value);
      closeList();
    },
    [options, onChange, closeList]
  );

  const moveActiveIndex = useCallback(
    (direction: 1 | -1) => {
      setActiveIndex((current) => {
        let next = current;
        for (let step = 0; step < options.length; step += 1) {
          next = (next + direction + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return current;
      });
    },
    [options.length, options]
  );

  // Scroll the highlighted option into view as it changes. Guarded because scrollIntoView
  // isn't implemented in jsdom (or some older embedded WebViews).
  useEffect(() => {
    const activeOption = isOpen && activeIndex >= 0 ? optionRefs.current[activeIndex] : null;
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inContainer = containerRef.current?.contains(target);
      // The listbox is portaled to document.body, so it's outside containerRef —
      // check it too, or clicking an option would close the list before it commits.
      const inListbox = listboxRef.current?.contains(target);
      if (!inContainer && !inListbox) {
        closeList(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, closeList]);

  // Keep the portaled menu anchored to the trigger while open (re-measure on
  // scroll/resize, including scroll inside a modal via a capture-phase listener).
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

  const handleTypeahead = useCallback(
    (char: string) => {
      if (typeaheadTimeoutRef.current) clearTimeout(typeaheadTimeoutRef.current);
      typeaheadRef.current += char.toLowerCase();
      const query = typeaheadRef.current;

      const searchFrom = isOpen ? activeIndex : selectedIndex;
      const orderedIndexes = [
        ...Array.from({ length: options.length - searchFrom - 1 }, (_, i) => searchFrom + 1 + i),
        ...Array.from({ length: searchFrom + 1 }, (_, i) => i),
      ];
      const match = orderedIndexes.find(
        (i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(query)
      );

      if (match !== undefined) {
        if (isOpen) {
          setActiveIndex(match);
        } else {
          onChange?.(options[match].value);
        }
      }

      typeaheadTimeoutRef.current = setTimeout(() => {
        typeaheadRef.current = '';
      }, 500);
    },
    [isOpen, activeIndex, selectedIndex, options, onChange]
  );

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        isOpen ? moveActiveIndex(1) : openList();
        break;
      case 'ArrowUp':
        event.preventDefault();
        isOpen ? moveActiveIndex(-1) : openList();
        break;
      case 'Home':
        if (isOpen) {
          event.preventDefault();
          setActiveIndex(firstEnabledIndex);
        }
        break;
      case 'End':
        if (isOpen) {
          event.preventDefault();
          setActiveIndex(lastEnabledIndex);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) {
          commitSelection(activeIndex);
        } else {
          openList();
        }
        break;
      case 'Escape':
        if (isOpen) {
          event.preventDefault();
          closeList();
        }
        break;
      case 'Tab':
        if (isOpen) closeList(false);
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key)) {
          handleTypeahead(event.key);
        }
        break;
    }
  };

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
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
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
        <span className={`truncate text-left ${!selectedOption ? 'text-content-tertiary' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`flex-shrink-0 text-content-tertiary transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && menuPos && createPortal(
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label={label || ariaLabel || placeholder}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            zIndex: 1000,
          }}
          className="
            max-h-60 overflow-auto
            rounded-md border border-border bg-surface-overlay py-1 shadow-lg
            focus:outline-none
          "
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-content-tertiary">No options</li>
          )}
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commitSelection(index)}
                className={`
                  flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer
                  ${option.disabled ? 'cursor-not-allowed text-content-disabled' : 'text-content-primary'}
                  ${isActive && !option.disabled ? 'bg-primary-subtle' : ''}
                `}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check size={16} className="flex-shrink-0 text-primary" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>,
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

Select.displayName = 'Select';

export default Select;

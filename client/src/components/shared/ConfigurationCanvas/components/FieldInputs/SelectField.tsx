import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { FieldInputProps } from '../../types';

interface SelectFieldProps extends FieldInputProps<string | string[]> {
  isMulti?: boolean;
}

/**
 * SelectField - Dropdown select field (single or multi-select)
 */
export const SelectField: React.FC<SelectFieldProps> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
  isMulti = false,
}) => {
  const options = field.options || [];

  // Handle single select
  if (!isMulti) {
    return (
      <div className="relative">
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`
            w-full px-3 py-2 pr-10
            text-sm
            bg-white dark:bg-gray-700
            border rounded-md
            appearance-none
            focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
            ${error
              ? 'border-red-300 dark:border-red-600'
              : 'border-gray-300 dark:border-gray-600'
            }
            ${className}
          `}
        >
          <option value="">
            {field.placeholder || 'Select an option...'}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    );
  }

  // Handle multi-select
  const selectedValues = Array.isArray(value) ? value : [];

  const toggleOption = (optValue: string) => {
    if (selectedValues.includes(optValue)) {
      onChange(selectedValues.filter((v) => v !== optValue));
    } else {
      onChange([...selectedValues, optValue]);
    }
  };

  const removeOption = (optValue: string) => {
    onChange(selectedValues.filter((v) => v !== optValue));
  };

  return (
    <div className={className}>
      {/* Selected items */}
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedValues.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="
                  inline-flex items-center gap-1
                  px-2 py-1
                  text-xs font-medium
                  bg-blue-100 text-blue-700
                  dark:bg-blue-900/30 dark:text-blue-300
                  rounded-full
                "
              >
                {opt?.label || v}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeOption(v)}
                    className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Options list */}
      <div
        className={`
          max-h-48 overflow-y-auto
          border rounded-md
          ${error
            ? 'border-red-300 dark:border-red-600'
            : 'border-gray-300 dark:border-gray-600'
          }
          ${disabled ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'}
        `}
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            No options available
          </div>
        ) : (
          options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`
                  flex items-center gap-2
                  px-3 py-2
                  cursor-pointer
                  hover:bg-gray-50 dark:hover:bg-gray-600
                  ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                  ${disabled ? 'cursor-not-allowed opacity-50' : ''}
                `}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleOption(opt.value)}
                  disabled={disabled}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    - {opt.description}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SelectField;

import React from 'react';
import { FieldInputProps } from '../../types';

/**
 * NumberField - Numeric input field
 */
export const NumberField: React.FC<FieldInputProps<number>> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange(undefined as unknown as number);
    } else {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        onChange(num);
      }
    }
  };

  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={handleChange}
      placeholder={field.placeholder}
      disabled={disabled}
      min={field.validation?.min}
      max={field.validation?.max}
      className={`
        w-full px-3 py-2
        text-sm
        bg-white dark:bg-gray-700
        border rounded-md
        placeholder-gray-400
        focus:ring-2 focus:ring-blue-500 focus:border-transparent
        disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
        ${error
          ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
          : 'border-gray-300 dark:border-gray-600'
        }
        ${className}
      `}
    />
  );
};

export default NumberField;

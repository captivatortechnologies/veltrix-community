import React from 'react';
import { FieldInputProps } from '../../types';

/**
 * CheckboxField - Boolean checkbox input
 */
export const CheckboxField: React.FC<FieldInputProps<boolean>> = ({
  field,
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  return (
    <label
      className={`
        inline-flex items-center gap-2
        cursor-pointer
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        ${className}
      `}
    >
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="
          w-4 h-4
          rounded
          border-gray-300 dark:border-gray-600
          text-amber-700
          focus:ring-2 focus:ring-amber-500 focus:ring-offset-0
          disabled:cursor-not-allowed
        "
      />
      {field.placeholder && (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {field.placeholder}
        </span>
      )}
    </label>
  );
};

export default CheckboxField;

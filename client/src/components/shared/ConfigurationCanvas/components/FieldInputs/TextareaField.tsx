import React from 'react';
import { FieldInputProps } from '../../types';

/**
 * TextareaField - Multi-line text input
 */
export const TextareaField: React.FC<FieldInputProps<string>> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
      rows={4}
      className={`
        w-full px-3 py-2
        text-sm
        bg-white dark:bg-gray-700
        border rounded-md
        placeholder-gray-400
        resize-y
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

export default TextareaField;

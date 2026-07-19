import React from 'react';
import { FieldInputProps } from '../../types';

interface TextFieldProps extends FieldInputProps<string> {
  inputType?: 'text' | 'password' | 'email' | 'url';
}

/**
 * TextField - Basic text input field
 */
export const TextField: React.FC<TextFieldProps> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
  inputType = 'text',
}) => {
  return (
    <input
      type={inputType}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
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

export default TextField;

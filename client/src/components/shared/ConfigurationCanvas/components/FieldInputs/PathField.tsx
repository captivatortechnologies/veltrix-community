import React from 'react';
import { Folder } from 'lucide-react';
import { FieldInputProps } from '../../types';

/**
 * PathField - File/directory path input with visual indicator
 */
export const PathField: React.FC<FieldInputProps<string>> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <Folder className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || '$SPLUNK_DB/...'}
        disabled={disabled}
        className={`
          w-full pl-10 pr-3 py-2
          text-sm font-mono
          bg-white dark:bg-gray-700
          border rounded-md
          placeholder-gray-400
          focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
          ${error
            ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
          }
        `}
      />
    </div>
  );
};

export default PathField;

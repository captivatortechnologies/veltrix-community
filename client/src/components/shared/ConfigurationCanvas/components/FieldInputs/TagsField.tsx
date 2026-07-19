import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { FieldInputProps } from '../../types';

/**
 * TagsField - Multiple tags/values input
 */
export const TagsField: React.FC<FieldInputProps<string[]>> = ({
  field,
  value,
  onChange,
  error,
  disabled = false,
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = Array.isArray(value) ? value : [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className={className}>
      {/* Tags display */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`
          flex flex-wrap gap-1.5
          min-h-[42px] p-2
          bg-white dark:bg-gray-700
          border rounded-md
          cursor-text
          ${error
            ? 'border-red-300 dark:border-red-600'
            : 'border-gray-300 dark:border-gray-600 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent'
          }
          ${disabled ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}
        `}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="
              inline-flex items-center gap-1
              px-2 py-1
              text-xs font-medium
              bg-gray-100 text-gray-700
              dark:bg-gray-600 dark:text-gray-200
              rounded-full
            "
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="hover:bg-gray-200 dark:hover:bg-gray-500 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputValue && addTag(inputValue)}
            placeholder={tags.length === 0 ? (field.placeholder || 'Type and press Enter') : ''}
            className="
              flex-1 min-w-[100px]
              bg-transparent
              border-none
              outline-none
              text-sm
              placeholder-gray-400
            "
          />
        )}
      </div>

      {/* Help text */}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Press Enter to add a tag
      </p>
    </div>
  );
};

export default TagsField;

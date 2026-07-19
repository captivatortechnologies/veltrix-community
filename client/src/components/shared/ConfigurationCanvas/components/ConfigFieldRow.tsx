import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, HelpCircle, AlertCircle } from 'lucide-react';
import { ConfigFieldRowProps } from '../types';
import { FieldInput } from './FieldInputs';

/**
 * ConfigFieldRow - A single key-value row within a section
 *
 * Features:
 * - Label on left (fixed width, right-aligned)
 * - Input field on right (flexible width)
 * - Drag handle for reordering
 * - Delete button on hover
 * - Validation error display
 * - Help tooltip
 */
export const ConfigFieldRow: React.FC<ConfigFieldRowProps> = ({
  field,
  onChange,
  onDelete,
  error,
  readOnly = false,
  dragHandleProps,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
    data: {
      type: 'field',
      field,
      sectionId: dragHandleProps?.['data-section-id'],
    },
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group
        flex items-start gap-3
        p-2
        rounded-md
        hover:bg-gray-50 dark:hover:bg-gray-700/50
        ${isDragging ? 'opacity-50 bg-blue-50 dark:bg-blue-900/20' : ''}
        ${error ? 'bg-red-50 dark:bg-red-900/10' : ''}
      `}
    >
      {/* Drag handle */}
      {!readOnly && (
        <button
          {...attributes}
          {...listeners}
          className="
            mt-2 p-1
            opacity-0 group-hover:opacity-100
            cursor-grab active:cursor-grabbing
            hover:bg-gray-200 dark:hover:bg-gray-600
            rounded
            transition-opacity
          "
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </button>
      )}

      {/* Label (fixed width, right-aligned) */}
      <div className="w-48 flex-shrink-0 pt-2 text-right">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {field.label}
          {field.required && (
            <span className="text-red-500 ml-0.5">*</span>
          )}
        </label>

        {/* Help tooltip */}
        {field.helpText && (
          <div className="relative inline-block ml-1 group/help">
            <HelpCircle className="w-3.5 h-3.5 inline text-gray-400 cursor-help" />
            <div className="
              absolute bottom-full left-1/2 -translate-x-1/2 mb-2
              hidden group-hover/help:block
              w-48 p-2
              text-xs text-left text-white
              bg-gray-900 dark:bg-gray-700
              rounded shadow-lg
              z-10
            ">
              {field.helpText}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
            </div>
          </div>
        )}
      </div>

      {/* Input field (flexible width) */}
      <div className="flex-1">
        <FieldInput
          field={field}
          value={field.value}
          onChange={onChange}
          error={error}
          disabled={readOnly || field.disabled}
        />

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-1 mt-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            {error}
          </div>
        )}
      </div>

      {/* Delete button */}
      {!readOnly && (
        <button
          onClick={onDelete}
          className="
            mt-2 p-1
            opacity-0 group-hover:opacity-100
            text-gray-400 hover:text-red-500
            hover:bg-gray-200 dark:hover:bg-gray-600
            rounded
            transition-opacity
          "
          title="Delete field"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ConfigFieldRow;

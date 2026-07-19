import React, { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  Plus,
  AlertCircle,
  Settings,
  Database,
  Clock,
  Search,
  Copy,
  FolderOpen,
} from 'lucide-react';
import { ConfigSectionProps, ConfigField } from '../types';
import { ConfigFieldRow } from './ConfigFieldRow';
import { countSectionErrors, getFieldError } from '../utils/validationUtils';
import { generateId } from '../utils/canvasUtils';

// Icon mapping for section icons
const iconMap: Record<string, React.ReactNode> = {
  Settings: <Settings className="w-4 h-4" />,
  Database: <Database className="w-4 h-4" />,
  Clock: <Clock className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Copy: <Copy className="w-4 h-4" />,
  FolderOpen: <FolderOpen className="w-4 h-4" />,
};

/**
 * ConfigSection - A collapsible section containing configuration fields
 *
 * Features:
 * - Drag handle for reordering sections
 * - Collapsible content
 * - Error indicator badge
 * - Delete button
 * - Add field button
 */
export const ConfigSectionComponent: React.FC<ConfigSectionProps> = ({
  section,
  collapsed,
  onToggleCollapse,
  onFieldChange,
  onFieldDelete,
  onFieldAdd,
  onSectionDelete,
  onAddEmptySection,
  onDuplicateItem,
  itemLabel,
  identityField,
  addBlockedReason,
  deleteBlockedReason,
  errors,
  readOnly = false,
}) => {
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: section.id,
    data: { type: 'section', section },
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const errorCount = countSectionErrors(errors, section.id);
  const sortedFields = [...section.fields].sort((a, b) => a.order - b.order);

  // Get the icon component
  const IconComponent = section.icon && iconMap[section.icon];

  // Title the card from the identity field's LIVE value (e.g. the index name as it's
  // typed), falling back to the section's own name. `identityField` is only set on
  // template-driven canvases; other canvases keep showing section.name as before.
  const identityValue = identityField
    ? sortedFields.find((f) => f.key === identityField)?.value
    : undefined;
  const displayName =
    typeof identityValue === 'string' && identityValue.trim() ? identityValue : section.name;

  // Group fields for display: ungrouped fields render first with no heading (matching
  // today's look), then each named group (ConfigField.group) gets its own subheading,
  // in the order its first field appears. This is presentation only — section.fields
  // stays a single flat, ordered list.
  const { ungroupedFields, fieldGroups } = useMemo(() => {
    const sorted = [...section.fields].sort((a, b) => a.order - b.order);
    const ungrouped: ConfigField[] = [];
    const order: string[] = [];
    const byGroup = new Map<string, ConfigField[]>();
    for (const field of sorted) {
      if (!field.group) {
        ungrouped.push(field);
        continue;
      }
      if (!byGroup.has(field.group)) {
        byGroup.set(field.group, []);
        order.push(field.group);
      }
      byGroup.get(field.group)!.push(field);
    }
    return {
      ungroupedFields: ungrouped,
      fieldGroups: order.map((name) => ({ name, fields: byGroup.get(name)! })),
    };
  }, [section.fields]);

  // Handle adding a new field
  const handleAddField = () => {
    if (!newFieldKey.trim()) return;

    const newField: ConfigField = {
      id: generateId(),
      key: newFieldKey.trim(),
      label: newFieldLabel.trim() || newFieldKey.trim(),
      type: 'text',
      value: '',
      order: section.fields.length,
    };

    onFieldAdd(newField);
    setNewFieldKey('');
    setNewFieldLabel('');
    setShowAddField(false);
  };

  // Shared row renderer so grouped and ungrouped fields render identically
  const renderFieldRow = (field: ConfigField) => (
    <ConfigFieldRow
      key={field.id}
      field={field}
      onChange={(value) => onFieldChange(field.id, value)}
      onDelete={() => onFieldDelete(field.id)}
      error={getFieldError(errors, section.id, field.id)}
      readOnly={readOnly}
      dragHandleProps={{
        'data-section-id': section.id,
      }}
    />
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700
        rounded-lg
        shadow-sm
        ${isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : ''}
      `}
    >
      {/* Section Header */}
      <div
        className={`
          flex items-center justify-between
          px-4 py-3
          border-b border-gray-200 dark:border-gray-700
          ${collapsed ? 'rounded-lg' : 'rounded-t-lg'}
          bg-gray-50 dark:bg-gray-800/50
        `}
      >
        <div className="flex items-center gap-3">
          {/* Drag handle */}
          {!readOnly && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              <GripVertical className="w-4 h-4 text-gray-400" />
            </button>
          )}

          {/* Collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            )}
          </button>

          {/* Section icon */}
          {IconComponent && (
            <span className="text-gray-500 dark:text-gray-400">
              {IconComponent}
            </span>
          )}

          {/* Section name — reflects the identity field's live value when available */}
          <h3 className="font-medium text-gray-900 dark:text-white">
            {displayName}
          </h3>

          {/* Error badge */}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30 rounded-full">
              <AlertCircle className="w-3 h-3" />
              {errorCount}
            </span>
          )}

          {/* Field count */}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {section.fields.length} {section.fields.length === 1 ? 'field' : 'fields'}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              {/* Add another empty item of this type, inserted directly below */}
              <button
                onClick={() => onAddEmptySection?.()}
                disabled={!!addBlockedReason}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={addBlockedReason ?? (itemLabel ? `Add another ${itemLabel}` : 'Add another empty stanza of this type')}
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Duplicate this item, carrying over its current field values (template-driven canvases only) */}
              {onDuplicateItem && (
                <button
                  onClick={onDuplicateItem}
                  disabled={!!addBlockedReason}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title={addBlockedReason ?? (itemLabel ? `Duplicate this ${itemLabel}` : 'Duplicate')}
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}

              {/* Delete section button */}
              <button
                onClick={onSectionDelete}
                disabled={!!deleteBlockedReason}
                className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={deleteBlockedReason ?? (itemLabel ? `Delete this ${itemLabel}` : 'Delete section')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section Content */}
      {!collapsed && (
        <div className="p-4">
          {sortedFields.length === 0 ? (
            /* Empty state */
            <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
              No fields in this section.
              {!readOnly && (
                <button
                  onClick={() => setShowAddField(true)}
                  className="ml-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Add one
                </button>
              )}
            </div>
          ) : (
            /* Fields list — ungrouped fields first (no heading, as before), then each
               named group under its own lightweight subheading. All fields share one
               SortableContext, so reordering still spans the whole item. */
            <SortableContext
              items={sortedFields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {ungroupedFields.map(renderFieldRow)}

                {fieldGroups.map((group) => (
                  <div key={group.name} className="pt-3 first:pt-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {group.name}
                      </h4>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                    <div className="space-y-2">{group.fields.map(renderFieldRow)}</div>
                  </div>
                ))}
              </div>
            </SortableContext>
          )}

          {/* Add field form */}
          {showAddField && !readOnly && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Key (e.g., maxDataSize)"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Label (optional)"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => {
                    setShowAddField(false);
                    setNewFieldKey('');
                    setNewFieldLabel('');
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddField}
                  disabled={!newFieldKey.trim()}
                  className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-md"
                >
                  Add Field
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConfigSectionComponent;

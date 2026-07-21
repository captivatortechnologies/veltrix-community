import React, { useState, useCallback, useMemo } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, pointerWithin, rectIntersection, CollisionDetection } from '@dnd-kit/core';
import { Tag } from 'lucide-react';
import { MultiSelect } from '../../MultiSelect';
import {
  ConfigurationCanvasProps,
  ConfigSection,
  ConfigField,
  ValidationError,
  ValidationResult,
  ExportFormat,
  PaletteItem,
  FormFieldSchema,
} from '../types';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasArea } from './CanvasArea';
import { ToolsPalette } from './ToolsPalette';
import { generateId } from '../utils/canvasUtils';
import { exportToFormat } from '../utils/exportUtils';
import { validateSections } from '../utils/validationUtils';
import { useFileParser } from '../hooks/useFileParser';
import { ConfigCanvasContext } from '../context';

/**
 * ConfigurationCanvas - Main container component
 *
 * A visual configuration builder that allows users to:
 * - Drag configuration items from a palette
 * - Organize items into collapsible sections
 * - Edit key-value pairs inline
 * - Export to multiple formats (JSON, YAML, .conf)
 */
export const ConfigurationCanvas: React.FC<ConfigurationCanvasProps> = ({
  initialSections = [],
  palette,
  toolType,
  entityType,
  onSave,
  onCancel,
  onChange,
  title = 'Configuration Canvas',
  configName,
  onConfigNameChange,
  showToolbar = true,
  showPalette = true,
  readOnly = false,
  className = '',
  availableTags = [],
  selectedTagIds = [],
  onTagsChange,
  createItem,
  itemLabel,
  identityField,
  repeatable = true,
  minItems = 1,
  maxItems,
}) => {
  // Canvas state
  const [sections, setSections] = useState<ConfigSection[]>(initialSections);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // Drag state
  const [activeDragItem, setActiveDragItem] = useState<PaletteItem | null>(null);

  // File parser hook
  const { parseFile } = useFileParser();

  // Update sections and mark as dirty
  const updateSections = useCallback(
    (newSections: ConfigSection[]) => {
      setSections(newSections);
      setIsDirty(true);
      onChange?.(newSections);
    },
    [onChange]
  );

  // Template-driven item add/remove limits (only meaningful when `createItem` is set —
  // the palette/drag-drop flow has no such caps and both reasons stay undefined for it).
  const addBlockedReason = useMemo(() => {
    if (!createItem) return undefined;
    if (!repeatable) return `Only one ${itemLabel ?? 'item'} is allowed`;
    if (maxItems !== undefined && sections.length >= maxItems) {
      return `Maximum of ${maxItems} ${itemLabel ?? 'items'} reached`;
    }
    return undefined;
  }, [createItem, repeatable, maxItems, sections.length, itemLabel]);

  const deleteBlockedReason = useMemo(() => {
    if (!createItem) return undefined;
    if (sections.length > minItems) return undefined;
    return minItems === 1
      ? `At least one ${itemLabel ?? 'item'} is required`
      : `At least ${minItems} ${itemLabel ?? 'items'} required`;
  }, [createItem, sections.length, minItems, itemLabel]);

  // Section operations
  const handleSectionAdd = useCallback(
    (section: ConfigSection) => {
      const newSection = {
        ...section,
        order: sections.length,
      };
      updateSections([...sections, newSection]);
    },
    [sections, updateSections]
  );

  const handleSectionChange = useCallback(
    (sectionId: string, updates: Partial<ConfigSection>) => {
      updateSections(
        sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
      );
    },
    [sections, updateSections]
  );

  const handleSectionDelete = useCallback(
    (sectionId: string) => {
      if (deleteBlockedReason) return;
      updateSections(sections.filter((s) => s.id !== sectionId));
    },
    [sections, updateSections, deleteBlockedReason]
  );

  const handleSectionReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newSections = [...sections];
      const [removed] = newSections.splice(fromIndex, 1);
      newSections.splice(toIndex, 0, removed);
      // Update order property
      const reordered = newSections.map((s, i) => ({ ...s, order: i }));
      updateSections(reordered);
    },
    [sections, updateSections]
  );

  // Field operations
  const handleFieldChange = useCallback(
    (sectionId: string, fieldId: string, value: unknown) => {
      updateSections(
        sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId ? { ...f, value } : f
                ),
              }
            : s
        )
      );
      // Clear validation error for this field when value changes
      setErrors((prevErrors) =>
        prevErrors.filter(
          (e) => !(e.sectionId === sectionId && e.fieldId === fieldId)
        )
      );
    },
    [sections, updateSections]
  );

  const handleFieldDelete = useCallback(
    (sectionId: string, fieldId: string) => {
      updateSections(
        sections.map((s) =>
          s.id === sectionId
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s
        )
      );
    },
    [sections, updateSections]
  );

  const handleFieldAdd = useCallback(
    (sectionId: string, field: ConfigField) => {
      updateSections(
        sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                fields: [
                  ...s.fields,
                  { ...field, order: s.fields.length },
                ],
              }
            : s
        )
      );
    },
    [sections, updateSections]
  );

  const handleFieldReorder = useCallback(
    (sectionId: string, fromIndex: number, toIndex: number) => {
      updateSections(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          const newFields = [...s.fields];
          const [removed] = newFields.splice(fromIndex, 1);
          newFields.splice(toIndex, 0, removed);
          return {
            ...s,
            fields: newFields.map((f, i) => ({ ...f, order: i })),
          };
        })
      );
    },
    [sections, updateSections]
  );

  // Build lookups from palette: item ID → conf file name, item ID/label → PaletteItem
  const { itemIdToConfFile, itemById, itemByLabel } = useMemo(() => {
    const idConfMap = new Map<string, string>();
    const idItemMap = new Map<string, PaletteItem>();
    const labelItemMap = new Map<string, PaletteItem>();
    for (const category of palette.categories) {
      const confFileName = category.name;
      const mapItem = (item: PaletteItem) => {
        idConfMap.set(item.id, confFileName);
        idItemMap.set(item.id, item);
        labelItemMap.set(item.label, item);
      };
      category.items?.forEach(mapItem);
      category.subcategories?.forEach((sub) => sub.items.forEach(mapItem));
    }
    return {
      itemIdToConfFile: idConfMap,
      itemById: idItemMap,
      itemByLabel: labelItemMap,
    };
  }, [palette.categories]);

  // Enrich sections with confFile/sourceItemId if missing (backward compat for saved configs)
  const enrichedSections = useMemo(() => {
    let needsEnrichment = false;
    const enriched = sections.map((section) => {
      if (section.confFile && section.sourceItemId) return section;
      const paletteItem = section.sourceItemId
        ? itemById.get(section.sourceItemId)
        : itemByLabel.get(section.name);
      if (!paletteItem) return section;
      const updates: Partial<typeof section> = {};
      if (!section.confFile) updates.confFile = itemIdToConfFile.get(paletteItem.id);
      if (!section.sourceItemId) updates.sourceItemId = paletteItem.id;
      if (Object.keys(updates).length > 0) {
        needsEnrichment = true;
        return { ...section, ...updates };
      }
      return section;
    });
    return needsEnrichment ? enriched : sections;
  }, [sections, itemById, itemByLabel, itemIdToConfFile]);

  // Convert FormFieldSchema to ConfigField
  const createFieldFromSchema = useCallback(
    (schema: FormFieldSchema): ConfigField => ({
      id: generateId(),
      key: schema.name,
      label: schema.label,
      type: schema.type,
      value: schema.defaultValue ?? '',
      required: schema.required,
      placeholder: schema.placeholder,
      helpText: schema.helpText,
      options: schema.options,
      validation: schema.validation,
      order: 0,
      defaultValue: schema.defaultValue,
    }),
    []
  );

  // Create section from palette item
  const createSectionFromItem = useCallback(
    (item: PaletteItem): ConfigSection => ({
      id: generateId(),
      name: item.label,
      icon: item.icon,
      collapsed: false,
      fields: item.formSchema.map((schema, index) => ({
        ...createFieldFromSchema(schema),
        order: index,
      })),
      order: sections.length,
      description: item.description,
      confFile: itemIdToConfFile.get(item.id),
      sourceItemId: item.id,
    }),
    [sections.length, createFieldFromSchema, itemIdToConfFile]
  );

  // Add a new empty item/section, inserted directly below the source. When `createItem`
  // is supplied (template-driven canvases), it builds the new item — this is the fix for
  // the dead palette lookup that used to silently no-op whenever the palette was empty
  // (every app-config canvas page passes an empty palette). Otherwise, falls back to the
  // original tools-palette lookup so drag-drop canvases are unaffected.
  const handleAddEmptySection = useCallback(
    (sectionId: string) => {
      const sourceIndex = sections.findIndex((s) => s.id === sectionId);
      if (sourceIndex === -1) return;

      let newSection: ConfigSection;
      if (createItem) {
        if (addBlockedReason) return;
        newSection = createItem();
      } else {
        const section = enrichedSections.find((s) => s.id === sectionId);
        if (!section) return;
        const paletteItem = section.sourceItemId
          ? itemById.get(section.sourceItemId)
          : itemByLabel.get(section.name);
        if (!paletteItem) return;
        newSection = createSectionFromItem(paletteItem);
      }

      // Insert after the source section and re-index orders
      const updated = [...sections];
      updated.splice(sourceIndex + 1, 0, newSection);
      updateSections(updated.map((s, i) => ({ ...s, order: i })));
    },
    [sections, enrichedSections, itemById, itemByLabel, createSectionFromItem, createItem, addBlockedReason, updateSections]
  );

  // Duplicate an item, seeding the new one with the source item's current field values —
  // the "don't retype the same entries" path. Template-driven canvases only.
  const handleDuplicateItem = useCallback(
    (sectionId: string) => {
      if (!createItem || addBlockedReason) return;
      const sourceIndex = sections.findIndex((s) => s.id === sectionId);
      if (sourceIndex === -1) return;

      const seed: Record<string, unknown> = {};
      for (const field of sections[sourceIndex].fields) {
        seed[field.key] = field.value;
      }
      const newSection = createItem(seed);

      const updated = [...sections];
      updated.splice(sourceIndex + 1, 0, newSection);
      updateSections(updated.map((s, i) => ({ ...s, order: i })));
    },
    [sections, createItem, addBlockedReason, updateSections]
  );

  // Add a brand-new, blank item appended to the end. Backs the canvas-level
  // "Add <itemLabel>" button. Template-driven canvases only.
  const handleAddItem = useCallback(() => {
    if (!createItem || addBlockedReason) return;
    const newSection = createItem();
    updateSections([...sections, { ...newSection, order: sections.length }]);
  }, [createItem, addBlockedReason, sections, updateSections]);

  // Custom collision detection for better drop handling
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    // For palette items, use rectIntersection to be more forgiving
    if (args.active.data.current?.type === 'palette-item') {
      const rectCollisions = rectIntersection(args);
      // Prioritize canvas-drop-zone if it's in the collisions
      const canvasCollision = rectCollisions.find(c => c.id === 'canvas-drop-zone');
      if (canvasCollision) {
        return [canvasCollision];
      }
      return rectCollisions;
    }
    // For other draggables, use pointerWithin
    return pointerWithin(args);
  }, []);

  // Drag and drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    // Check if dragging from palette
    if (active.data.current?.type === 'palette-item') {
      setActiveDragItem(active.data.current.item as PaletteItem);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragItem(null);

      if (!over) return;

      // Dropping palette item onto canvas (check for canvas drop zone or any valid target)
      if (active.data.current?.type === 'palette-item') {
        // Accept drop on canvas-drop-zone or when dropped on sections area
        const isValidDropTarget = over.id === 'canvas-drop-zone' ||
          over.data.current?.type === 'canvas' ||
          over.data.current?.type === 'section';

        if (isValidDropTarget) {
          const item = active.data.current.item as PaletteItem;
          const newSection = createSectionFromItem(item);
          handleSectionAdd(newSection);
        }
        return;
      }

      // Reordering sections
      if (
        active.data.current?.type === 'section' &&
        over.data.current?.type === 'section'
      ) {
        const fromIndex = sections.findIndex((s) => s.id === active.id);
        const toIndex = sections.findIndex((s) => s.id === over.id);
        if (fromIndex !== toIndex) {
          handleSectionReorder(fromIndex, toIndex);
        }
        return;
      }

      // Reordering fields within a section
      if (
        active.data.current?.type === 'field' &&
        over.data.current?.type === 'field'
      ) {
        const sectionId = active.data.current.sectionId;
        if (sectionId === over.data.current.sectionId) {
          const section = sections.find((s) => s.id === sectionId);
          if (section) {
            const fromIndex = section.fields.findIndex(
              (f) => f.id === active.id
            );
            const toIndex = section.fields.findIndex((f) => f.id === over.id);
            if (fromIndex !== toIndex) {
              handleFieldReorder(sectionId, fromIndex, toIndex);
            }
          }
        }
      }
    },
    [
      sections,
      createSectionFromItem,
      handleSectionAdd,
      handleSectionReorder,
      handleFieldReorder,
    ]
  );

  // Validation
  const validate = useCallback((): ValidationResult => {
    const result = validateSections(sections);
    setErrors(result.errors);
    return result;
  }, [sections]);

  const validationResult = useMemo(
    () => ({ isValid: errors.length === 0, errors }),
    [errors]
  );

  // Save handler
  const handleSave = useCallback(async () => {
    const result = validate();
    if (!result.isValid) {
      console.log('[ConfigurationCanvas] Validation failed');
      return;
    }

    setIsSaving(true);
    try {
      const exportData = exportToFormat(sections, 'json', {
        name: title,
        toolType,
        entityType,
      });
      // Include selected tags in export data
      exportData.tagIds = selectedTagIds;
      console.log('[ConfigurationCanvas] Saving data:', exportData);
      await onSave?.(exportData);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [sections, title, toolType, entityType, onSave, validate, selectedTagIds]);

  // Export handler
  const handleExport = useCallback(
    (format: ExportFormat) => {
      const exportData = exportToFormat(sections, format, {
        name: title,
        toolType,
        entityType,
      });
      // Download the file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [sections, title, toolType, entityType]
  );

  // File upload handler
  const handleUpload = useCallback(
    async (file: File) => {
      try {
        const parsedSections = await parseFile(file);
        // Append or replace sections (for now, replace all)
        updateSections(parsedSections.map((s, index) => ({ ...s, order: index })));
      } catch (error) {
        console.error('Failed to parse file:', error);
        // Could show a toast notification here
      }
    },
    [parseFile, updateSections]
  );

  return (
    <ConfigCanvasContext.Provider
      value={{ toolType, entityType, appId: toolType, environmentId: selectedTagIds[0] }}
    >
    <DndContext
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className={`flex flex-col min-h-full bg-gray-50 dark:bg-gray-900 ${className}`}
      >
        {/* Toolbar */}
        {showToolbar && (
          <CanvasToolbar
            title={title}
            configName={configName}
            onConfigNameChange={onConfigNameChange}
            onSave={handleSave}
            onCancel={onCancel ?? (() => {})}
            onExport={handleExport}
            onUpload={handleUpload}
            isSaving={isSaving}
            isDirty={isDirty}
            validationResult={validationResult}
          />
        )}

        {/* Environment/Tags selector */}
        {availableTags.length > 0 && onTagsChange && !readOnly && (
          <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex flex-shrink-0 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Tag className="w-4 h-4" />
                <span>Environments:</span>
              </div>
              <div className="min-w-0 max-w-xl flex-1">
                <MultiSelect
                  aria-label="Environments"
                  placeholder="Select environments…"
                  options={availableTags.map((tag) => ({ value: tag.id, label: tag.name }))}
                  value={selectedTagIds}
                  onChange={onTagsChange}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main content area - grows with content */}
        <div className="flex flex-1 items-stretch">
          {/* Canvas area - main drop zone */}
          <div className="flex-1 p-6 min-h-[500px]">
            <CanvasArea
              sections={enrichedSections}
              onSectionChange={handleSectionChange}
              onSectionDelete={handleSectionDelete}
              onSectionAdd={handleSectionAdd}
              onSectionReorder={handleSectionReorder}
              onFieldChange={handleFieldChange}
              onFieldDelete={handleFieldDelete}
              onFieldAdd={handleFieldAdd}
              onFieldReorder={handleFieldReorder}
              onAddEmptySection={handleAddEmptySection}
              onDuplicateItem={createItem ? handleDuplicateItem : undefined}
              onAddItem={createItem ? handleAddItem : undefined}
              itemLabel={itemLabel}
              identityField={identityField}
              addBlockedReason={addBlockedReason}
              deleteBlockedReason={deleteBlockedReason}
              errors={errors}
              readOnly={readOnly}
            />
          </div>

          {/* Tools palette sidebar - scrollable */}
          {showPalette && !readOnly && (
            <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 self-start max-h-screen overflow-y-auto">
              <ToolsPalette config={palette} />
            </div>
          )}
        </div>
      </div>

      {/* Drag overlay for visual feedback */}
      <DragOverlay>
        {activeDragItem && (
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 border-2 border-blue-500 opacity-90">
            <div className="font-medium text-gray-900 dark:text-white">
              {activeDragItem.label}
            </div>
            {activeDragItem.description && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {activeDragItem.description}
              </div>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </ConfigCanvasContext.Provider>
  );
};

export default ConfigurationCanvas;

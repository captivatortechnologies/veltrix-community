import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Layers, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { CanvasAreaProps, ConfigSection } from '../types';
import { ConfigSectionComponent } from './ConfigSection';

interface SectionGroup {
  confFile: string;
  sections: ConfigSection[];
}

/**
 * CanvasArea - The main scrollable area containing configuration sections
 *
 * Features:
 * - Droppable zone for palette items
 * - Sortable sections list
 * - Visual grouping by conf file
 * - Empty state when no sections exist
 */
export const CanvasArea: React.FC<CanvasAreaProps> = ({
  sections,
  onSectionChange,
  onSectionDelete,
  onFieldChange,
  onFieldDelete,
  onFieldAdd,
  onFieldReorder,
  onAddEmptySection,
  onDuplicateItem,
  onAddItem,
  itemLabel,
  identityField,
  addBlockedReason,
  deleteBlockedReason,
  errors,
  readOnly = false,
  className = '',
}) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: 'canvas-drop-zone',
    data: {
      type: 'canvas',
      accepts: ['palette-item'],
    },
  });

  // Check if we're dragging a palette item
  const isDraggingPaletteItem = active?.data.current?.type === 'palette-item';

  // Sort sections by order
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections]
  );

  // Track collapsed groups
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const toggleGroup = (confFile: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(confFile)) {
        next.delete(confFile);
      } else {
        next.add(confFile);
      }
      return next;
    });
  };

  // Group sections by confFile, preserving order
  const groupedSections = useMemo((): SectionGroup[] => {
    const groups: SectionGroup[] = [];
    const groupMap = new Map<string, SectionGroup>();

    for (const section of sortedSections) {
      const key = section.confFile || 'Ungrouped';
      let group = groupMap.get(key);
      if (!group) {
        group = { confFile: key, sections: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.sections.push(section);
    }

    return groups;
  }, [sortedSections]);

  // Check if we have multiple groups (only show headers when there's more than one group)
  const hasMultipleGroups = groupedSections.length > 1;

  // Get errors for a specific section
  const getSectionErrors = (sectionId: string) =>
    errors.filter((e) => e.sectionId === sectionId);

  // Determine if we should show the drop highlight
  const showDropHighlight = isOver && isDraggingPaletteItem;

  // Render sections (used both for grouped and ungrouped)
  const renderSections = (sectionsList: ConfigSection[]) =>
    sectionsList.map((section) => (
      <ConfigSectionComponent
        key={section.id}
        section={section}
        collapsed={section.collapsed ?? false}
        onToggleCollapse={() =>
          onSectionChange(section.id, { collapsed: !section.collapsed })
        }
        onFieldChange={(fieldId, value) =>
          onFieldChange(section.id, fieldId, value)
        }
        onFieldDelete={(fieldId) =>
          onFieldDelete(section.id, fieldId)
        }
        onFieldAdd={(field) => onFieldAdd(section.id, field)}
        onSectionDelete={() => onSectionDelete(section.id)}
        onFieldReorder={(fromIndex, toIndex) =>
          onFieldReorder(section.id, fromIndex, toIndex)
        }
        onAddEmptySection={
          onAddEmptySection ? () => onAddEmptySection(section.id) : undefined
        }
        onDuplicateItem={
          onDuplicateItem ? () => onDuplicateItem(section.id) : undefined
        }
        itemLabel={itemLabel}
        identityField={identityField}
        addBlockedReason={addBlockedReason}
        deleteBlockedReason={deleteBlockedReason}
        errors={getSectionErrors(section.id)}
        readOnly={readOnly}
      />
    ));

  // "Add <itemLabel>" — the primary, always-available way to add another item on
  // template-driven canvases. Rendered wherever onAddItem is supplied; hidden entirely
  // for the palette/drag-drop flow (onAddItem is undefined there).
  const addItemButton = !readOnly && onAddItem && (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onAddItem}
        disabled={!!addBlockedReason}
        className="
          flex items-center gap-2 px-4 py-2
          text-sm font-medium text-white
          bg-indigo-600 hover:bg-indigo-700
          disabled:bg-indigo-300 disabled:cursor-not-allowed
          rounded-md transition-colors
        "
      >
        <Plus className="w-4 h-4" />
        Add {itemLabel ?? 'Item'}
      </button>
      {addBlockedReason && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{addBlockedReason}</span>
      )}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-[400px]
        rounded-lg
        transition-all duration-200
        ${isDraggingPaletteItem ? 'ring-2 ring-dashed ring-blue-300 dark:ring-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : ''}
        ${showDropHighlight ? 'ring-blue-500 dark:ring-blue-400 bg-blue-100 dark:bg-blue-900/30' : ''}
        ${className}
      `}
    >
      {sortedSections.length === 0 ? (
        onAddItem ? (
          /* Empty state — template-driven canvas with no items yet */
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No items yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
              Add your first {itemLabel ?? 'item'} to get started.
            </p>
            {addItemButton}
          </div>
        ) : (
          /* Empty state — tools-palette / drag-drop canvas */
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <Layers className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No configuration sections yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md mb-6">
              Drag items from the Tools Palette on the right to add configuration
              sections to your canvas.
            </p>
            {!readOnly && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Plus className="w-4 h-4" />
                <span>Drop items here to get started</span>
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {/* Sections list — grouped by conf file */}
          <SortableContext
            items={sortedSections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {hasMultipleGroups
                ? groupedSections.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.confFile);
                    return (
                      <div
                        key={group.confFile}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                      >
                        {/* Group header */}
                        <button
                          onClick={() => toggleGroup(group.confFile)}
                          className="
                            w-full flex items-center gap-3 px-4 py-3
                            bg-gray-100 dark:bg-gray-800
                            hover:bg-gray-150 dark:hover:bg-gray-750
                            transition-colors cursor-pointer
                            border-b border-gray-200 dark:border-gray-700
                          "
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                          )}
                          <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {group.confFile}
                          </span>
                          <span className="ml-auto px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 rounded-full">
                            {group.sections.length} {group.sections.length === 1 ? 'stanza' : 'stanzas'}
                          </span>
                        </button>

                        {/* Group content */}
                        {!isCollapsed && (
                          <div className="p-4 space-y-4 bg-white dark:bg-gray-900/50">
                            {renderSections(group.sections)}
                          </div>
                        )}
                      </div>
                    );
                  })
                : /* Single group or no grouping — render flat */
                  <div className="space-y-4">
                    {renderSections(sortedSections)}
                  </div>
              }
            </div>
          </SortableContext>

          {/* Add another item — always available below the list on template-driven canvases */}
          {addItemButton && <div className="mt-6">{addItemButton}</div>}
        </>
      )}

      {/* Drop indicator when dragging palette item */}
      {isDraggingPaletteItem && (
        <div
          className={`
            mt-4 border-2 border-dashed rounded-lg p-8 text-center
            transition-all duration-200
            ${showDropHighlight
              ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/40'
              : 'border-blue-300 dark:border-blue-600'
            }
          `}
        >
          <Plus className={`w-6 h-6 mx-auto mb-2 ${showDropHighlight ? 'text-blue-600' : 'text-blue-400'}`} />
          <span className={`text-sm ${showDropHighlight ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-blue-500 dark:text-blue-400'}`}>
            {showDropHighlight ? 'Release to add section' : 'Drag here to add a new section'}
          </span>
        </div>
      )}
    </div>
  );
};

export default CanvasArea;

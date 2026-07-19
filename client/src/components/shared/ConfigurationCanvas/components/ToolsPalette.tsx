import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Search,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Settings,
  Database,
  Clock,
  Shield,
  Copy,
  Layers,
  X,
  HardDrive,
  Archive,
  Network,
  Globe,
  Key,
  Terminal,
  Monitor,
  FileText,
  ArrowDownToLine,
} from 'lucide-react';
import { ToolsPaletteProps, PaletteCategory, PaletteItem, PaletteSubcategory } from '../types';

// Icon mapping for category icons
const categoryIconMap: Record<string, React.ReactNode> = {
  Settings: <Settings className="w-4 h-4" />,
  Database: <Database className="w-4 h-4" />,
  Clock: <Clock className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Copy: <Copy className="w-4 h-4" />,
  Shield: <Shield className="w-4 h-4" />,
  Layers: <Layers className="w-4 h-4" />,
  HardDrive: <HardDrive className="w-4 h-4" />,
  Archive: <Archive className="w-4 h-4" />,
  Network: <Network className="w-4 h-4" />,
  Globe: <Globe className="w-4 h-4" />,
  Key: <Key className="w-4 h-4" />,
  Terminal: <Terminal className="w-4 h-4" />,
  Monitor: <Monitor className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
  ArrowDownToLine: <ArrowDownToLine className="w-4 h-4" />,
};

/**
 * Draggable palette item component
 */
const DraggablePaletteItem: React.FC<{
  item: PaletteItem;
  onDragStart?: (item: PaletteItem) => void;
  onDragEnd?: () => void;
}> = ({ item }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.id}`,
    data: {
      type: 'palette-item',
      item,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`
        flex items-center gap-3
        p-2.5
        bg-white dark:bg-gray-700
        border border-gray-200 dark:border-gray-600
        rounded-md
        cursor-grab active:cursor-grabbing
        hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20
        transition-colors
        ${isDragging ? 'opacity-50 ring-2 ring-blue-500' : ''}
      `}
    >
      <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {item.label}
        </div>
        {item.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {item.description}
          </div>
        )}
      </div>
      {item.complexity === 'advanced' && (
        <span className="px-1.5 py-0.5 text-xs font-medium text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30 rounded">
          Adv
        </span>
      )}
    </div>
  );
};

/**
 * Expandable subcategory section
 */
const SubcategorySection: React.FC<{
  subcategory: PaletteSubcategory;
  expanded: boolean;
  onToggle: () => void;
  filteredItems: PaletteItem[];
  onDragStart?: (item: PaletteItem) => void;
  onDragEnd?: () => void;
}> = ({ subcategory, expanded, onToggle, filteredItems, onDragStart, onDragEnd }) => {
  const IconComponent = subcategory.icon && categoryIconMap[subcategory.icon];

  return (
    <div className="border-t border-gray-100 dark:border-gray-700/50 first:border-t-0">
      <button
        onClick={onToggle}
        className="
          flex items-center justify-between
          w-full pl-8 pr-4 py-2
          hover:bg-gray-50 dark:hover:bg-gray-700/50
          transition-colors
        "
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
          {IconComponent && (
            <span className="text-gray-400 dark:text-gray-500">
              {IconComponent}
            </span>
          )}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {subcategory.name}
          </span>
        </div>
        <span className="px-1.5 py-0.5 text-xs text-gray-400 bg-gray-50 dark:text-gray-500 dark:bg-gray-800 rounded">
          {filteredItems.length}
        </span>
      </button>

      {expanded && filteredItems.length > 0 && (
        <div className="pl-10 pr-4 pb-2 space-y-1.5">
          {filteredItems.map((item) => (
            <DraggablePaletteItem
              key={item.id}
              item={item}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FilteredSubcategory extends PaletteSubcategory {
  filteredItems: PaletteItem[];
}

interface FilteredCategory extends PaletteCategory {
  filteredItems: PaletteItem[];
  filteredSubcategories?: FilteredSubcategory[];
}

/**
 * Expandable category section
 */
const CategorySection: React.FC<{
  category: FilteredCategory;
  expanded: boolean;
  onToggle: () => void;
  expandedSubcategories: Set<string>;
  onToggleSubcategory: (subcategoryId: string) => void;
  onDragStart?: (item: PaletteItem) => void;
  onDragEnd?: () => void;
}> = ({ category, expanded, onToggle, expandedSubcategories, onToggleSubcategory, onDragStart, onDragEnd }) => {
  const IconComponent = category.icon && categoryIconMap[category.icon];

  // Calculate total items (direct items + items in subcategories)
  const totalItems = category.filteredItems.length +
    (category.filteredSubcategories?.reduce((acc, sub) => acc + sub.filteredItems.length, 0) || 0);

  const hasSubcategories = category.filteredSubcategories && category.filteredSubcategories.length > 0;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="
          flex items-center justify-between
          w-full px-4 py-3
          hover:bg-gray-50 dark:hover:bg-gray-700/50
          transition-colors
        "
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          {IconComponent && (
            <span className="text-gray-500 dark:text-gray-400">
              {IconComponent}
            </span>
          )}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {category.name}
          </span>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-700 rounded-full">
          {totalItems}
        </span>
      </button>

      {expanded && (
        <div>
          {/* Direct items (if no subcategories) */}
          {!hasSubcategories && category.filteredItems.length > 0 && (
            <div className="px-4 pb-3 space-y-2">
              {category.filteredItems.map((item) => (
                <DraggablePaletteItem
                  key={item.id}
                  item={item}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          )}

          {/* Subcategories */}
          {hasSubcategories && (
            <div className="pb-2">
              {category.filteredSubcategories!.map((subcategory) => (
                <SubcategorySection
                  key={subcategory.id}
                  subcategory={subcategory}
                  expanded={expandedSubcategories.has(subcategory.id)}
                  onToggle={() => onToggleSubcategory(subcategory.id)}
                  filteredItems={subcategory.filteredItems}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ToolsPalette - Right sidebar with draggable configuration items
 *
 * Features:
 * - Search field for filtering items
 * - Category filter buttons
 * - Complexity filter (Basic/Advanced)
 * - Expandable category sections
 * - Draggable items
 */
export const ToolsPalette: React.FC<ToolsPaletteProps> = ({
  config,
  onItemDragStart,
  onItemDragEnd,
  className = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [complexityFilter, setComplexityFilter] = useState<'basic' | 'advanced' | null>(null);

  // Initialize expanded categories from defaults
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    config.categories.forEach((c) => {
      if (c.defaultExpanded) initial.add(c.id);
    });
    return initial;
  });

  // Initialize expanded subcategories from defaults
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    config.categories.forEach((c) => {
      c.subcategories?.forEach((sub) => {
        if (sub.defaultExpanded) initial.add(sub.id);
      });
    });
    return initial;
  });

  // Filter items based on search, category, and complexity
  const filterItems = (items: PaletteItem[]): PaletteItem[] => {
    return items.filter((item) => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          item.label.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term) ||
          item.type.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }

      // Complexity filter
      if (complexityFilter && item.complexity !== complexityFilter) {
        return false;
      }

      return true;
    });
  };

  // Get filtered categories with subcategories
  const filteredCategories = useMemo(() => {
    return config.categories
      .filter((category) => !categoryFilter || category.id === categoryFilter)
      .map((category): FilteredCategory => {
        // Filter direct items
        const filteredItems = filterItems(category.items || []);

        // Filter subcategories and their items
        const filteredSubcategories = category.subcategories?.map((sub): FilteredSubcategory => ({
          ...sub,
          filteredItems: filterItems(sub.items),
        })).filter((sub) => sub.filteredItems.length > 0 || !searchTerm);

        return {
          ...category,
          filteredItems,
          filteredSubcategories,
        };
      })
      .filter((category) => {
        const hasDirectItems = category.filteredItems.length > 0;
        const hasSubcategoryItems = category.filteredSubcategories?.some((sub) => sub.filteredItems.length > 0);
        return hasDirectItems || hasSubcategoryItems || !searchTerm;
      });
  }, [config.categories, searchTerm, categoryFilter, complexityFilter]);

  // Total item count
  const totalCount = useMemo(() => {
    return filteredCategories.reduce((acc, cat) => {
      const directItems = cat.filteredItems.length;
      const subcategoryItems = cat.filteredSubcategories?.reduce((subAcc, sub) => subAcc + sub.filteredItems.length, 0) || 0;
      return acc + directItems + subcategoryItems;
    }, 0);
  }, [filteredCategories]);

  // Toggle category expansion
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  // Toggle subcategory expansion
  const toggleSubcategory = (subcategoryId: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subcategoryId)) {
        next.delete(subcategoryId);
      } else {
        next.add(subcategoryId);
      }
      return next;
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter(null);
    setComplexityFilter(null);
  };

  const hasFilters = searchTerm || categoryFilter || complexityFilter;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {config.title || 'Tools Palette'}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Drag & drop to canvas
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={config.searchPlaceholder || 'Search tools...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="
              w-full pl-9 pr-3 py-2
              text-sm
              bg-gray-50 dark:bg-gray-700
              border border-gray-200 dark:border-gray-600
              rounded-md
              placeholder-gray-400
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
            "
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {config.showFilters !== false && (
        <div className="px-4 py-3 space-y-3 border-b border-gray-200 dark:border-gray-700">
          {/* Category filter */}
          {config.categoryFilters && config.categoryFilters.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Category
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`
                    px-2.5 py-1 text-xs font-medium rounded-full
                    transition-colors
                    ${
                      categoryFilter === null
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  All
                </button>
                {config.categoryFilters.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`
                      px-2.5 py-1 text-xs font-medium rounded-full
                      transition-colors
                      ${
                        categoryFilter === cat
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }
                    `}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complexity filter */}
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Complexity
            </div>
            <div className="flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => setComplexityFilter(null)}
                className={`
                  flex-1 px-3 py-1.5 text-xs font-medium
                  transition-colors
                  ${
                    complexityFilter === null
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }
                `}
              >
                All
              </button>
              <button
                onClick={() => setComplexityFilter('basic')}
                className={`
                  flex-1 px-3 py-1.5 text-xs font-medium
                  border-l border-gray-200 dark:border-gray-600
                  transition-colors
                  ${
                    complexityFilter === 'basic'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }
                `}
              >
                Basic
              </button>
              <button
                onClick={() => setComplexityFilter('advanced')}
                className={`
                  flex-1 px-3 py-1.5 text-xs font-medium
                  border-l border-gray-200 dark:border-gray-600
                  transition-colors
                  ${
                    complexityFilter === 'advanced'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }
                `}
              >
                Advanced
              </button>
            </div>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Categories list */}
      <div className="flex-1">
        {filteredCategories.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No items match your filters
          </div>
        ) : (
          filteredCategories.map((category) => (
            <CategorySection
              key={category.id}
              category={category}
              expanded={expandedCategories.has(category.id)}
              onToggle={() => toggleCategory(category.id)}
              expandedSubcategories={expandedSubcategories}
              onToggleSubcategory={toggleSubcategory}
              onDragStart={onItemDragStart}
              onDragEnd={onItemDragEnd}
            />
          ))
        )}
      </div>

      {/* Footer with total count */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {totalCount} {totalCount === 1 ? 'item' : 'items'} available
        </div>
      </div>
    </div>
  );
};

export default ToolsPalette;

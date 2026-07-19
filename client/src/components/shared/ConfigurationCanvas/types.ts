/**
 * Configuration Canvas - Type Definitions
 *
 * A visual configuration builder for creating and managing
 * tool configurations (Splunk, CrowdStrike, etc.)
 */

// ============================================
// Field Types
// ============================================

/**
 * Supported field input types
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'textarea'
  | 'tags'
  | 'password'
  | 'path'
  | 'files'
  | 'keyvalue';

/**
 * Option for select/multiselect fields
 */
export interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * A single file authored for the `files` field type — one entry in the app/TA
 * folder structure (e.g. `{ path: 'default/inputs.conf', content: '[monitor://...]' }`).
 * The field value for a `files` field is `FileEntry[]`.
 */
export interface FileEntry {
  path: string;
  content: string;
  /** True when this file was imported (copied) from another saved config. */
  imported?: boolean;
  /** Human-readable name of the config this file was imported from. */
  source?: string;
}

/**
 * A single attribute for the `keyvalue` field type — one `key = value` line
 * (e.g. a Splunk .conf stanza attribute). The field value is `KeyValueEntry[]`.
 */
export interface KeyValueEntry {
  key: string;
  value: string;
}

/**
 * A known-file suggestion for the `files` field. When a `files` field declares a
 * `fileCatalog`, the filename becomes a searchable combobox of these entries
 * (with descriptions) for the folders each entry applies to — e.g. the list of
 * Splunk .conf files for the default/ and local/ folders. Free-text filenames
 * are still allowed.
 */
export interface FileCatalogEntry {
  /** The filename, e.g. "inputs.conf". */
  value: string;
  /** Optional display label; defaults to `value`. */
  label?: string;
  /** What the file configures (shown beside the option and when selected). */
  description?: string;
  /** Folders this file applies to; defaults to `default` and `local`. */
  folders?: string[];
  /** Starter content seeded into the editor when this file is chosen and empty. */
  template?: string;
}

/**
 * Field validation rules
 */
export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  /** Custom validation function - return error message or null */
  custom?: (value: unknown) => string | null;
}

/**
 * A single configuration field within a section
 */
export interface ConfigField {
  id: string;
  /** The configuration key (e.g., "homePath") */
  key: string;
  /** Display label (e.g., "Home Path") */
  label: string;
  type: FieldType;
  value: unknown;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FieldOption[];
  validation?: FieldValidation;
  /** Known-file catalog for a `files` field (drives the filename combobox). */
  fileCatalog?: FileCatalogEntry[];
  /** Presentational group this field renders under inside its item (e.g. "Sizing"). */
  group?: string;
  /** Position within section (for ordering) */
  order: number;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Default value for the field */
  defaultValue?: unknown;
}

// ============================================
// Section Types
// ============================================

/**
 * A collapsible section containing configuration fields
 */
export interface ConfigSection {
  id: string;
  name: string;
  /** Lucide icon name */
  icon?: string;
  collapsed?: boolean;
  fields: ConfigField[];
  /** Position in the canvas (for ordering) */
  order: number;
  /** Optional description for the section */
  description?: string;
  /** Parent conf file name for grouping (e.g., "indexes.conf") */
  confFile?: string;
  /** ID of the palette item that created this section (for duplicating) */
  sourceItemId?: string;
}

// ============================================
// Tools Palette Types
// ============================================

/**
 * Schema for generating form fields when a palette item is dropped
 */
export interface FormFieldSchema {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  helpText?: string;
  options?: FieldOption[];
  validation?: FieldValidation;
  /** Known-file catalog for a `files` field (drives the filename combobox). */
  fileCatalog?: FileCatalogEntry[];
}

/**
 * A draggable item in the tools palette
 */
export interface PaletteItem {
  id: string;
  /** Type identifier for the item */
  type: string;
  label: string;
  description?: string;
  /** Lucide icon name */
  icon?: string;
  /** Category this item belongs to */
  category: string;
  complexity?: 'basic' | 'advanced';
  /** Default data when creating this item */
  defaultData?: Record<string, unknown>;
  /** Schema for generating the configuration form */
  formSchema: FormFieldSchema[];
}

/**
 * A subcategory within a palette category
 */
export interface PaletteSubcategory {
  id: string;
  name: string;
  /** Lucide icon name */
  icon?: string;
  items: PaletteItem[];
  /** Whether the subcategory is expanded by default */
  defaultExpanded?: boolean;
}

/**
 * A category in the tools palette
 */
export interface PaletteCategory {
  id: string;
  name: string;
  /** Lucide icon name */
  icon?: string;
  /** Direct items in this category (if no subcategories) */
  items?: PaletteItem[];
  /** Nested subcategories */
  subcategories?: PaletteSubcategory[];
  /** Whether the category is expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Configuration for the tools palette
 */
export interface ToolsPaletteConfig {
  title?: string;
  categories: PaletteCategory[];
  searchPlaceholder?: string;
  showFilters?: boolean;
  /** Category filter options */
  categoryFilters?: string[];
  /** Complexity filter options */
  complexityFilters?: ('basic' | 'advanced')[];
}

// ============================================
// Canvas State Types
// ============================================

/**
 * The current state of the configuration canvas
 */
export interface CanvasState {
  sections: ConfigSection[];
  isDirty: boolean;
  selectedSectionId?: string;
  selectedFieldId?: string;
  errors: ValidationError[];
}

/**
 * A validation error for a specific field
 */
export interface ValidationError {
  sectionId: string;
  fieldId: string;
  message: string;
}

/**
 * Result of canvas validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// ============================================
// Export Types
// ============================================

/**
 * Supported export formats
 */
export type ExportFormat = 'json' | 'yaml' | 'conf' | 'ini';

/**
 * Data structure for canvas export
 */
export interface CanvasExportData {
  /** Name of the configuration */
  name: string;
  /** Description of the configuration */
  description?: string;
  /** Tool type (e.g., "SPLUNK_ENTERPRISE") */
  toolType: string;
  /** Entity type (e.g., "INDEXES") */
  entityType: string;
  /** The sections with their fields */
  sections: ConfigSection[];
  /** Extracted key-value configuration data */
  configData: Record<string, unknown>;
  /** Export format used */
  format: ExportFormat;
  /** Timestamp of export */
  exportedAt: string;
  /** Selected environment/tag IDs */
  tagIds?: string[];
}

/**
 * Parsed stanza from a .conf file
 */
export interface ConfStanza {
  name: string;
  settings: Record<string, string>;
}

/**
 * Result of parsing a .conf file
 */
export interface ParsedConfFile {
  stanzas: ConfStanza[];
  defaultSettings: Record<string, string>;
}

// ============================================
// Collaboration Types
// ============================================

/**
 * A user collaborating on the canvas
 */
export interface CollaborationUser {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  /** Current cursor position */
  cursor?: {
    sectionId: string;
    fieldId?: string;
  };
  /** Unique color for this user's cursor/selection */
  color: string;
  /** When the user joined */
  joinedAt: Date;
}

/**
 * Types of changes that can be made to the canvas
 */
export type CanvasChangeType =
  | 'field_update'
  | 'field_add'
  | 'field_delete'
  | 'section_add'
  | 'section_delete'
  | 'section_reorder'
  | 'field_reorder';

/**
 * A change made to the canvas (for collaboration sync)
 */
export interface CanvasChange {
  id: string;
  type: CanvasChangeType;
  userId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * State of real-time collaboration
 */
export interface CollaborationState {
  canvasId: string;
  activeUsers: CollaborationUser[];
  pendingChanges: CanvasChange[];
  lastSyncedAt: Date;
  isConnected: boolean;
}

// ============================================
// Component Props Types
// ============================================

/**
 * Props for field input components
 */
export interface FieldInputProps<T = unknown> {
  field: ConfigField;
  value: T;
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Props for the ConfigFieldRow component
 */
export interface ConfigFieldRowProps {
  field: ConfigField;
  onChange: (value: unknown) => void;
  onDelete: () => void;
  error?: string;
  readOnly?: boolean;
  isDragging?: boolean;
  /** Attributes for drag handle */
  dragHandleProps?: Record<string, unknown>;
}

/**
 * Props for the ConfigSection component
 */
export interface ConfigSectionProps {
  section: ConfigSection;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
  onFieldDelete: (fieldId: string) => void;
  onFieldAdd: (field: ConfigField) => void;
  onSectionDelete: () => void;
  onFieldReorder: (fromIndex: number, toIndex: number) => void;
  /** Add an empty copy of this section type */
  onAddEmptySection?: () => void;
  /** Duplicate this item, copying its current field values into a new item (template-driven canvases only). */
  onDuplicateItem?: () => void;
  /** Singular noun for what this section represents, e.g. "Index" (template-driven canvases only). */
  itemLabel?: string;
  /** Field key whose live value should title this item card, falling back to section.name. */
  identityField?: string;
  /** Reason the add/duplicate actions are disabled right now (e.g. max items reached); undefined = allowed. */
  addBlockedReason?: string;
  /** Reason the delete action is disabled right now (e.g. minimum items reached); undefined = allowed. */
  deleteBlockedReason?: string;
  errors: ValidationError[];
  readOnly?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

/**
 * Props for the ToolsPalette component
 */
export interface ToolsPaletteProps {
  config: ToolsPaletteConfig;
  onItemDragStart?: (item: PaletteItem) => void;
  onItemDragEnd?: () => void;
  className?: string;
}

/**
 * Props for the CanvasToolbar component
 */
export interface CanvasToolbarProps {
  /** Main title (e.g., "New Splunk Configuration") */
  title: string;
  /** Editable configuration name */
  configName?: string;
  /** Callback when configuration name changes */
  onConfigNameChange?: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onExport: (format: ExportFormat) => void;
  onUpload: (file: File) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
  validationResult?: ValidationResult;
  className?: string;
}

/**
 * Props for the main ConfigurationCanvas component
 */
export interface ConfigurationCanvasProps {
  /** Initial sections to display */
  initialSections?: ConfigSection[];
  /** Tools palette configuration */
  palette: ToolsPaletteConfig;
  /** Canvas ID for collaboration */
  canvasId?: string;
  /** Tool type (e.g., "SPLUNK_ENTERPRISE") */
  toolType: string;
  /** Entity type (e.g., "INDEXES") */
  entityType: string;

  /** Callback when canvas is saved */
  onSave?: (data: CanvasExportData) => void;
  /** Callback when cancel is clicked */
  onCancel?: () => void;
  /** Callback when sections change */
  onChange?: (sections: ConfigSection[]) => void;

  /** Canvas title displayed in toolbar (e.g., "New Splunk Configuration") */
  title?: string;
  /** Editable configuration name */
  configName?: string;
  /** Callback when configuration name changes */
  onConfigNameChange?: (name: string) => void;
  /** Show the toolbar */
  showToolbar?: boolean;
  /** Show the tools palette sidebar */
  showPalette?: boolean;
  /** Make the canvas read-only */
  readOnly?: boolean;
  /** Enable real-time collaboration */
  enableCollaboration?: boolean;

  /** Custom field type components */
  fieldTypes?: Record<string, React.ComponentType<FieldInputProps>>;
  /** Additional CSS classes */
  className?: string;

  /** Available tags/environments for selection */
  availableTags?: Array<{ id: string; name: string }>;
  /** Currently selected tag IDs */
  selectedTagIds?: string[];
  /** Callback when tags change */
  onTagsChange?: (tagIds: string[]) => void;

  /**
   * Factory that builds a new item (ConfigSection) from a template, optionally seeded
   * with an existing item's field values (`{ [field.key]: value }`) for "Duplicate".
   * When provided, item add/duplicate/remove is template-driven — the per-item "+" /
   * "Duplicate" actions and the canvas-level "Add <itemLabel>" button all call this
   * INSTEAD of resolving a tools-palette item. When absent, the palette/drag-drop flow
   * behaves exactly as before.
   */
  createItem?: (seed?: Record<string, unknown>) => ConfigSection;
  /** Singular noun for one item, e.g. "Index" -> "Add Index". Defaults to "Item". */
  itemLabel?: string;
  /** Field key whose live value should title each item card, falling back to section.name. */
  identityField?: string;
  /** Whether more than one item may exist. Defaults to true. */
  repeatable?: boolean;
  /** Minimum items required — delete is blocked at/below this count. Defaults to 1. */
  minItems?: number;
  /** Maximum items allowed — add/duplicate is blocked at this count. */
  maxItems?: number;
}

/**
 * Props for the CanvasArea component
 */
export interface CanvasAreaProps {
  sections: ConfigSection[];
  onSectionChange: (sectionId: string, updates: Partial<ConfigSection>) => void;
  onSectionDelete: (sectionId: string) => void;
  onSectionAdd: (section: ConfigSection) => void;
  onSectionReorder: (fromIndex: number, toIndex: number) => void;
  onFieldChange: (sectionId: string, fieldId: string, value: unknown) => void;
  onFieldDelete: (sectionId: string, fieldId: string) => void;
  onFieldAdd: (sectionId: string, field: ConfigField) => void;
  onFieldReorder: (sectionId: string, fromIndex: number, toIndex: number) => void;
  /** Add an empty copy of the given section's type */
  onAddEmptySection?: (sectionId: string) => void;
  /** Duplicate an item, copying its current field values into a new item (template-driven canvases only). */
  onDuplicateItem?: (sectionId: string) => void;
  /** Add a brand-new item, appended to the end (template-driven canvases only). */
  onAddItem?: () => void;
  /** Singular noun for the items this canvas edits, e.g. "Index". */
  itemLabel?: string;
  /** Field key whose live value should title each item card. */
  identityField?: string;
  /** Reason item add/duplicate is disabled right now (e.g. max items reached); undefined = allowed. */
  addBlockedReason?: string;
  /** Reason item delete is disabled right now (e.g. minimum items reached); undefined = allowed. */
  deleteBlockedReason?: string;
  errors: ValidationError[];
  readOnly?: boolean;
  className?: string;
}

/**
 * Props for the FileUploader component
 */
export interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  onFileParsed: (sections: ConfigSection[]) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

/**
 * Props for the CollaborationBar component
 */
export interface CollaborationBarProps {
  users: CollaborationUser[];
  currentUserId: string;
  className?: string;
}

// ============================================
// Hook Return Types
// ============================================

/**
 * Return type for useCanvasState hook
 */
export interface UseCanvasStateReturn {
  state: CanvasState;
  // Section operations
  addSection: (section: ConfigSection) => void;
  updateSection: (sectionId: string, updates: Partial<ConfigSection>) => void;
  deleteSection: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;
  // Field operations
  addField: (sectionId: string, field: ConfigField) => void;
  updateField: (sectionId: string, fieldId: string, value: unknown) => void;
  deleteField: (sectionId: string, fieldId: string) => void;
  reorderFields: (sectionId: string, fromIndex: number, toIndex: number) => void;
  // Selection
  selectSection: (sectionId: string | undefined) => void;
  selectField: (sectionId: string | undefined, fieldId: string | undefined) => void;
  // Validation
  validate: () => ValidationResult;
  // State management
  reset: (sections?: ConfigSection[]) => void;
  setDirty: (isDirty: boolean) => void;
  // Export
  exportData: (format: ExportFormat) => CanvasExportData;
}

/**
 * Return type for useValidation hook
 */
export interface UseValidationReturn {
  errors: ValidationError[];
  validateField: (sectionId: string, field: ConfigField) => string | null;
  validateSection: (section: ConfigSection) => ValidationError[];
  validateAll: (sections: ConfigSection[]) => ValidationResult;
  clearErrors: () => void;
}

/**
 * Return type for useCollaboration hook
 */
export interface UseCollaborationReturn {
  state: CollaborationState;
  isConnected: boolean;
  connect: (canvasId: string) => void;
  disconnect: () => void;
  broadcastChange: (change: Omit<CanvasChange, 'id' | 'timestamp'>) => void;
  updateCursor: (cursor: CollaborationUser['cursor']) => void;
}

/**
 * Return type for useFileParser hook
 */
export interface UseFileParserReturn {
  isLoading: boolean;
  error: string | null;
  parseFile: (file: File) => Promise<ConfigSection[]>;
  parseContent: (content: string, format: ExportFormat) => ConfigSection[];
}

/**
 * Return type for useToolsPalette hook
 */
export interface UseToolsPaletteReturn {
  filteredCategories: PaletteCategory[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (category: string | null) => void;
  complexityFilter: 'basic' | 'advanced' | null;
  setComplexityFilter: (complexity: 'basic' | 'advanced' | null) => void;
  getItemCount: (categoryId: string) => number;
  getTotalCount: () => number;
}

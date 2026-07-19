/**
 * Configuration Canvas - Public Exports
 *
 * A visual configuration builder for creating and managing
 * tool configurations (Splunk, CrowdStrike, etc.)
 */

// Main component
export { ConfigurationCanvas } from './components/ConfigurationCanvas';
export { default as ConfigurationCanvasDefault } from './components/ConfigurationCanvas';

// Sub-components (for custom layouts)
export { CanvasArea } from './components/CanvasArea';
export { CanvasToolbar } from './components/CanvasToolbar';
export { ConfigSectionComponent } from './components/ConfigSection';
export { ConfigFieldRow } from './components/ConfigFieldRow';
export { ToolsPalette } from './components/ToolsPalette';

// Field inputs
export {
  FieldInput,
  TextField,
  NumberField,
  SelectField,
  CheckboxField,
  TextareaField,
  TagsField,
  PathField,
} from './components/FieldInputs';

// Collaboration components
export {
  CollaborationCursor,
  CollaborationCursors,
} from './components/CollaborationCursor';
export {
  CollaborationPresence,
  CollaborationPresenceMinimal,
} from './components/CollaborationPresence';
export {
  SectionLockBadge,
  SectionLockOverlay,
} from './components/SectionLockBadge';

// Version control components
export { VersionHistory } from './components/VersionHistory';

// Approval dialog
export { ApprovalSubmissionDialog } from './components/ApprovalSubmissionDialog';
export type { ApprovalSubmissionData } from './components/ApprovalSubmissionDialog';

// Approval status display
export { default as ApprovalStatusBadge } from './components/ApprovalStatusBadge';

// Types
export type {
  // Field types
  FieldType,
  FieldOption,
  FieldValidation,
  ConfigField,
  // Section types
  ConfigSection,
  // Palette types
  FormFieldSchema,
  PaletteItem,
  PaletteCategory,
  ToolsPaletteConfig,
  // Canvas state types
  CanvasState,
  ValidationError,
  ValidationResult,
  // Export types
  ExportFormat,
  CanvasExportData,
  ConfStanza,
  ParsedConfFile,
  // Collaboration types
  CollaborationUser,
  CanvasChangeType,
  CanvasChange,
  CollaborationState,
  // Component props
  FieldInputProps,
  ConfigFieldRowProps,
  ConfigSectionProps,
  ToolsPaletteProps,
  CanvasToolbarProps,
  ConfigurationCanvasProps,
  CanvasAreaProps,
  FileUploaderProps,
  CollaborationBarProps,
  // Hook return types
  UseCanvasStateReturn,
  UseValidationReturn,
  UseCollaborationReturn,
  UseFileParserReturn,
  UseToolsPaletteReturn,
} from './types';

// Utilities
export {
  generateId,
  reorderArray,
  moveItem,
  deepClone,
  debounce,
  throttle,
  generateUserColor,
  slugify,
} from './utils/canvasUtils';

export {
  validateField,
  validateSection,
  validateSections,
  hasFieldError,
  getFieldError,
  countSectionErrors,
  requiredRule,
  minLengthRule,
  maxLengthRule,
  rangeRule,
  patternRule,
  VALIDATION_PATTERNS,
  COMMON_VALIDATORS,
} from './utils/validationUtils';

export {
  extractConfigData,
  exportToJson,
  exportToYaml,
  exportToConf,
  exportToFormat,
  getExportContent,
  getMimeType,
  getFileExtension,
  downloadConfig,
} from './utils/exportUtils';

export {
  parseConfFile,
  confToSections,
  formatKeyAsLabel,
  inferFieldType,
  parseConfValue,
  sectionsToConf,
  validateConfSyntax,
} from './utils/confParser';

// Hooks
export {
  useValidation,
  useFileParser,
  useCanvasCollaboration,
} from './hooks';
export type {
  UseCanvasCollaborationOptions,
  UseCanvasCollaborationReturn,
} from './hooks';

// API
export { configurationCanvasApi } from './api/configurationCanvasApi';
export type {
  ConfigurationCanvas as ConfigurationCanvasData,
  ConfigurationCanvasListItem,
  ConfigCanvasStatus,
  CreateConfigurationCanvasRequest,
  UpdateConfigurationCanvasRequest,
  ConfigurationCanvasHistoryEntry,
  VersionComparisonResult,
  ApprovalEntry,
  ApprovalStatus,
  ReviewComment,
} from './api/configurationCanvasApi';

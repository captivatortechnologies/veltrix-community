/**
 * Shared Component Library — public barrel
 * -----------------------------------------
 * Two tiers live under `components/shared/`:
 *
 * 1. UI primitives (Button, Input, Select, Card, Badge, Tooltip, Tabs, FormField,
 *    EmptyState, Skeleton, Toast, ConfirmationDialog) — pure presentational, zero
 *    dependencies beyond `react` and `lucide-react`, no imports from outside this
 *    directory. These are re-exported flat below and are exactly the surface exposed to
 *    app client bundles through `@veltrixsecops/app-sdk/ui` (see
 *    client/src/appRuntime/installHostRuntime.ts) as well as the extraction
 *    candidates for a future standalone `@veltrix/ui` package (see
 *    src/styles/tokens.css + tailwind-preset.cjs for the paired token layer,
 *    and `packages/ui` in the monorepo layout).
 *
 * 2. Composite feature modules (ConfigurationCanvas, VersionControl, Pipeline) — larger,
 *    data-fetching UI features specific to this app (they still import `@/services/api`
 *    and `@/config`, so they are NOT extraction-ready — see each module's docblock).
 *    Re-exported below under a namespace to avoid name collisions between them (e.g. both
 *    ConfigurationCanvas and Pipeline export a `ValidationResult` type).
 *
 * Prefer importing straight from a component's own folder
 * (`@/components/shared/Button`) in app code — this root barrel exists mainly as the
 * single source of truth for what "the design system" contains, and as the extraction
 * point for the future package.
 */

// ---- UI primitives -------------------------------------------------------

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Input, type InputProps, type InputSize, type InputVariant } from './Input';
export { Textarea, type TextareaProps } from './Textarea';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { Select, type SelectProps, type SelectOption, type SelectSize } from './Select';
export {
  MultiSelect,
  type MultiSelectProps,
  type MultiSelectOption,
  type MultiSelectSize,
} from './MultiSelect';
export { SearchBox, type SearchBoxProps, type SearchBoxSize } from './SearchBox';
export { Pagination, type PaginationProps } from './Pagination';
export {
  FilterBar,
  type FilterBarProps,
  type FilterBarSearchProps,
  type FilterDefinition,
  type FilterOption,
} from './FilterBar';
export { SortSelect, type SortSelectProps, type SortOption, type SortDirection } from './SortSelect';
export { Tooltip, type TooltipProps, type TooltipPlacement } from './Tooltip';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner';
export { FormField, type FormFieldProps } from './FormField';
export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
  type CardBodyProps,
  type CardFooterProps,
} from './Card';
export { Badge, type BadgeProps, type BadgeVariant, type BadgeSize } from './Badge';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableSort,
  type DataTableSortOrder,
  type DataTableAlign,
  type DataTablePaginationState,
  type DataTableEmptyState,
} from './DataTable';
export {
  StatsCard,
  type StatsCardProps,
  type StatsCardVariant,
  type StatsCardDelta,
} from './StatsCard';
export {
  FormDialog,
  type FormDialogProps,
  type FormDialogSize,
} from './FormDialog';
export {
  Modal,
  type ModalProps,
  type ModalSize,
} from './Modal';
export {
  OverlayPortal,
  BRAND_SCOPED_CSS_VARS,
  type OverlayPortalProps,
} from './OverlayPortal';
export {
  Alert,
  type AlertProps,
  type AlertVariant,
} from './Alert';
export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  type SkeletonProps,
  type SkeletonTextProps,
  type SkeletonCardProps,
  type SkeletonVariant,
} from './Skeleton';
export {
  ToastProvider,
  useToast,
  Toast,
  ToastContainer,
  type ToastType,
  type ToastVariant,
  type ToastOptions,
  type ToastContextValue,
} from './Toast';
export {
  ConfirmationDialogProvider,
  useConfirmDialog,
  ConfirmationDialog,
  type ConfirmationOptions,
  type ConfirmationVariant,
  type ConfirmationState,
  type ConfirmationDialogContextValue,
} from './ConfirmationDialog';

// ---- Composite feature modules (app-specific, namespaced) ----------------

export * as ConfigurationCanvasModule from './ConfigurationCanvas';
export * as VersionControlModule from './VersionControl';
export * as PipelineModule from './Pipeline';

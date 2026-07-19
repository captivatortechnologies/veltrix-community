/**
 * Version Control Shared Component
 *
 * A GitHub/GitLab-like version control component for tracking configuration changes,
 * viewing diffs, and managing approval workflows.
 *
 * @example Basic Usage
 * ```tsx
 * import { VersionControlPanel } from '@/components/shared/VersionControl';
 *
 * <VersionControlPanel
 *   entityType="INDEX"
 *   entityId={indexId}
 *   showApprovals={true}
 *   showTimeline={true}
 * />
 * ```
 *
 * @example Standalone DiffViewer
 * ```tsx
 * import { DiffViewer } from '@/components/shared/VersionControl';
 *
 * <DiffViewer
 *   oldValue={previousConfig}
 *   newValue={currentConfig}
 *   title="Configuration Changes"
 * />
 * ```
 *
 * @example Using the Hook
 * ```tsx
 * import { useVersionControl, VersionTimeline } from '@/components/shared/VersionControl';
 *
 * function ConfigHistory() {
 *   const { history, isLoading, approve, reject, revert } = useVersionControl({
 *     entityType: 'ROLE',
 *     entityId: roleId,
 *   });
 *
 *   return (
 *     <VersionTimeline
 *       entries={history}
 *       isLoading={isLoading}
 *       onEntryClick={(entry) => console.log(entry)}
 *     />
 *   );
 * }
 * ```
 */

// Types
export * from './types';

// Utils
export * from './utils';

// Hooks
export * from './hooks';

// API
export { versionControlApi } from './api/versionControlApi';

// Components
export {
  VersionControlPanel,
  DiffViewer,
  DiffLine,
  FieldDiff,
  VersionTimeline,
  VersionTimelineItem,
  PendingApprovals,
  ApprovalCard,
  VersionDetailModal,
  VersionCompareModal,
  VersionFilters,
} from './components';

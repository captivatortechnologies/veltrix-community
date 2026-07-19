// Backward-compatible re-export. The real implementation now lives in
// components/shared/Tabs (see _ai_tasks/ui-package/2026-07-10 ADR:
// @veltrixsecops/app-sdk/ui exposes the platform's shared component library
// to app client bundles, so Tabs was promoted from a one-off `ui/` component
// into the shared tier). Existing consumers (AccessControlPage, Vendor) keep
// importing `Tabs`/`Tab` from this path unchanged.
export { Tabs as default, Tabs } from '../shared/Tabs';
export type { TabItem as Tab, TabsProps } from '../shared/Tabs';

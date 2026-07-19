// ========================================================================
// "Installed Apps" / "Marketplace" sidebar link contract
//
// Two related but mutually exclusive top-level sidebar destinations:
//
//  - "Apps" -> /apps (InstalledAppsPage): a dedicated page listing every app
//    installed for the caller's organization, regardless of enabled/disabled
//    state. Also stays "active" while the user is on an installed app's own
//    pages (/apps/:appId, /apps/:appId/*) since that's exactly where clicking
//    an app on the Apps page leads - the nav item shouldn't go dark just
//    because the URL moved one level deeper into the app itself.
//
//  - "Marketplace" -> /marketplace (AppManagementPage): the full catalog of
//    installable apps/tools for this tenant, including ones not yet
//    installed. Active only on the catalog page itself, never on an
//    individual app's pages (those belong to "Apps").
//
// These helpers are the single source of truth for both destinations and
// their "is this nav entry active" logic, so the contract can be unit
// tested without mounting the full Sidebar component tree (which needs
// AppContext/FeatureFlagContext providers).
// ========================================================================

/** Destination for the sidebar's "Apps" nav item (installed apps list). */
export const INSTALLED_APPS_PATH = '/apps';

/** Destination for the sidebar's "Marketplace" nav item (full catalog). */
export const MARKETPLACE_PATH = '/marketplace';

/** Matches `/apps/:appId` and any deeper path under an installed app. */
const INSTALLED_APP_DETAIL_PATTERN = /^\/apps\/[^/]+/;

/**
 * True when the current location is the "Apps" destination itself (`/apps`),
 * or any page belonging to a specific installed app (`/apps/:appId`,
 * `/apps/:appId/...`) - i.e. everywhere reachable by clicking an app on the
 * Apps page.
 */
export function isInstalledAppsRouteActive(pathname: string): boolean {
  return pathname === INSTALLED_APPS_PATH || INSTALLED_APP_DETAIL_PATTERN.test(pathname);
}

/**
 * True only when the current location is the Marketplace catalog itself
 * (`/marketplace`, exactly). Kept mutually exclusive with
 * `isInstalledAppsRouteActive` so the two sidebar entries never both read
 * as active for the same location.
 */
export function isMarketplaceRouteActive(pathname: string): boolean {
  return pathname === MARKETPLACE_PATH;
}

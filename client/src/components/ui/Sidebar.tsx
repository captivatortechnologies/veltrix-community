import React, { useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFeatureFlags } from '../../contexts/FeatureFlagContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useBrand } from '../../brand';
import {
  Home,
  BarChart2,
  Settings as SettingsIcon,
  Shield,
  FileText,
  Key,
  Building,
  ChevronRight,
  ChevronLeft,
  ClipboardCheck,
  Users,
  Database,
  GitBranch,
  Layers,
  Store,
  PackageCheck,
  FlaskConical,
  Network,
} from 'lucide-react';
import SidebarNavItem from './sidebar/SidebarNavItem';
import { useSidebarCollapse } from './sidebar/useSidebarCollapse';
import {
  INSTALLED_APPS_PATH,
  MARKETPLACE_PATH,
  isInstalledAppsRouteActive,
  isMarketplaceRouteActive,
} from './sidebar/installedAppsLink';

interface SidebarProps {
  className?: string;
}

const REPORTS_ROUTES = [
  '/reports',
  '/reports/security-overview',
  '/reports/compliance',
  '/reports/audit-logs',
  '/reports/user-activity',
  '/reports/resource-usage',
];

const SETTINGS_ROUTES = [
  '/settings',
  '/settings/organization',
  '/settings/keys-token',
  '/settings/connectivity',
  '/settings/logs',
  '/access-control',
];

const Sidebar: React.FC<SidebarProps> = ({ className = '' }) => {
  const location = useLocation();
  const { isEnabled } = useFeatureFlags();
  const brand = useBrand();
  // Wave C (RBAC/IdP hardening 2026-07-10): fail-closed defense-in-depth for
  // the one Settings link that is meaningless without its gated resource —
  // Access Control maps 1:1 to role.route.ts's hasPermission('role','read').
  // Users with all:all / platform admins see it exactly as before.
  const { hasPermission } = usePermissions();
  const canViewAccessControl = hasPermission('role', 'read');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useSidebarCollapse();

  const reportsSubmenuId = useId();
  const settingsSubmenuId = useId();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isReportsActive = () => REPORTS_ROUTES.some((path) => location.pathname === path);
  const isSettingsActive = () => SETTINGS_ROUTES.some((path) => location.pathname === path);

  // Defined once and placed differently by collapse state (see below): expanded
  // keeps Home and the toggle on one row; collapsed puts the toggle on its own
  // centered row so the Home icon lines up with every other rail icon.
  const collapseToggle = (
    <button
      type="button"
      onClick={() => setIsCollapsed(!isCollapsed)}
      className="flex-shrink-0 rounded-full border border-white/20 bg-blue-600 p-1 text-white shadow-md hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
      aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-pressed={isCollapsed}
    >
      {isCollapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
    </button>
  );

  const homeNavItem = (
    <SidebarNavItem
      to="/"
      icon={<Home size={20} aria-hidden="true" />}
      label="Home"
      isActive={isActive('/')}
      isCollapsed={isCollapsed}
    />
  );

  return (
    <aside
      className={`flex h-screen flex-shrink-0 flex-col bg-gray-800 text-white transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      } ${className}`}
    >
      {/* Sidebar Header */}
      <div className={`flex items-center border-b border-gray-700 py-5 ${isCollapsed ? 'justify-center' : 'px-4'}`}>
        <Shield className="h-8 w-8 text-blue-500" aria-hidden="true" />
        {!isCollapsed && (
          <div className="ml-2 flex flex-col leading-tight">
            <span className="text-xl font-semibold">{brand.name}</span>
            {brand.vendor && <span className="text-xs text-gray-400">{brand.vendor}</span>}
          </div>
        )}
      </div>

      {/* Sidebar Content */}
      <nav aria-label="Primary" className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-2 py-4' : 'p-4'}`}>
        <div className="space-y-1">
          {/* Home + collapse toggle. Expanded: Home fills the row with the
              toggle to its right. Collapsed: the toggle gets its own centered
              row above Home so the Home icon aligns with every other rail icon
              instead of being pushed off-center by the toggle sharing its row. */}
          {isCollapsed ? (
            <>
              <div className="flex justify-center">{collapseToggle}</div>
              {homeNavItem}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{homeNavItem}</div>
              {collapseToggle}
            </div>
          )}

          <SidebarNavItem
            to="/pipeline"
            icon={<GitBranch size={20} aria-hidden="true" />}
            label="Pipeline"
            isActive={isActive('/pipeline')}
            isCollapsed={isCollapsed}
          />

          <SidebarNavItem
            to="/environments"
            icon={<Layers size={20} aria-hidden="true" />}
            label="Environments"
            isActive={isActive('/environments')}
            isCollapsed={isCollapsed}
          />

          {/* Sidebar label is the terse "Apps" (org scope is implicit - these
              are always *this organization's* apps), but the destination is
              the dedicated Installed Apps page (InstalledAppsPage) listing
              every app installed for this organization, regardless of
              enabled state - unlike the old per-app nested sidebar groups,
              it scales to dozens of installed apps without turning the
              sidebar itself into a scroll-fest. Always shown (like
              Reports/Settings), not gated on having any apps installed - the
              destination page has its own honest empty state pointing at the
              Marketplace. Stays active while browsing an installed app's own
              pages (/apps/:appId/*), see installedAppsLink.ts. */}
          <SidebarNavItem
            to={INSTALLED_APPS_PATH}
            icon={<PackageCheck size={20} aria-hidden="true" />}
            label="Apps"
            isActive={isInstalledAppsRouteActive(location.pathname)}
            isCollapsed={isCollapsed}
          />

          {/* Developer sandboxes (feature-flagged rollout) */}
          {isEnabled('platform.sandbox') && (
            <SidebarNavItem
              to="/sandboxes"
              icon={<FlaskConical size={20} aria-hidden="true" />}
              label="Sandboxes"
              isActive={isActive('/sandboxes')}
              isCollapsed={isCollapsed}
            />
          )}

          {/* "Marketplace" (formerly "Apps") is the full catalog of
              installable apps/tools for this tenant, including ones not yet
              installed - distinct from "Installed Apps" above. */}
          <SidebarNavItem
            to={MARKETPLACE_PATH}
            icon={<Store size={20} aria-hidden="true" />}
            label="Marketplace"
            isActive={isMarketplaceRouteActive(location.pathname)}
            isCollapsed={isCollapsed}
          />

          {/* Reports with submenu */}
          <div>
            <SidebarNavItem
              to="/reports"
              icon={<BarChart2 size={20} aria-hidden="true" />}
              label="Reports"
              isActive={isReportsActive()}
              isCollapsed={isCollapsed}
              hasSubmenu
              isSubmenuOpen={reportsOpen}
              submenuId={reportsSubmenuId}
              onToggle={() => setReportsOpen((open) => !open)}
            />

            {reportsOpen && !isCollapsed && (
              <div id={reportsSubmenuId} className="mt-1 space-y-1">
                <SidebarNavItem
                  to="/reports/security-overview"
                  icon={<Shield size={16} aria-hidden="true" />}
                  label="Security Overview"
                  isActive={isActive('/reports/security-overview')}
                  indent
                />
                <SidebarNavItem
                  to="/reports/compliance"
                  icon={<ClipboardCheck size={16} aria-hidden="true" />}
                  label="Compliance"
                  isActive={isActive('/reports/compliance')}
                  indent
                />
                <SidebarNavItem
                  to="/reports/audit-logs"
                  icon={<FileText size={16} aria-hidden="true" />}
                  label="Audit Logs"
                  isActive={isActive('/reports/audit-logs')}
                  indent
                />
                <SidebarNavItem
                  to="/reports/user-activity"
                  icon={<Users size={16} aria-hidden="true" />}
                  label="User Activity"
                  isActive={isActive('/reports/user-activity')}
                  indent
                />
                <SidebarNavItem
                  to="/reports/resource-usage"
                  icon={<Database size={16} aria-hidden="true" />}
                  label="Resource Usage"
                  isActive={isActive('/reports/resource-usage')}
                  indent
                />
              </div>
            )}
          </div>

          {/* Settings with submenu */}
          <div>
            <SidebarNavItem
              to="/settings"
              icon={<SettingsIcon size={20} aria-hidden="true" />}
              label="Settings"
              isActive={isSettingsActive()}
              isCollapsed={isCollapsed}
              hasSubmenu
              isSubmenuOpen={settingsOpen}
              submenuId={settingsSubmenuId}
              onToggle={() => setSettingsOpen((open) => !open)}
            />

            {settingsOpen && !isCollapsed && (
              <div id={settingsSubmenuId} className="mt-1 space-y-1">
                {canViewAccessControl && (
                  <SidebarNavItem
                    to="/access-control"
                    icon={<Shield size={16} aria-hidden="true" />}
                    label="Access Control"
                    isActive={isActive('/access-control')}
                    indent
                  />
                )}
                <SidebarNavItem
                  to="/settings/organization"
                  icon={<Building size={16} aria-hidden="true" />}
                  label="Organization"
                  isActive={isActive('/settings/organization')}
                  indent
                />
                <SidebarNavItem
                  to="/settings/keys-token"
                  icon={<Key size={16} aria-hidden="true" />}
                  label="Keys & Tokens"
                  isActive={isActive('/settings/keys-token')}
                  indent
                />
                <SidebarNavItem
                  to="/settings/connectivity"
                  icon={<Network size={16} aria-hidden="true" />}
                  label="Connectivity (ZTNA)"
                  isActive={isActive('/settings/connectivity')}
                  indent
                />
                <SidebarNavItem
                  to="/settings/logs"
                  icon={<FileText size={16} aria-hidden="true" />}
                  label="Logs"
                  isActive={isActive('/settings/logs')}
                  indent
                />
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className={`border-t border-gray-700 py-4 ${isCollapsed ? 'px-2 text-center' : 'px-4'}`}>
        <div className="text-xs text-gray-400">
          {isCollapsed ? (
            <p>v{brand.version}</p>
          ) : (
            <>
              <p>{brand.vendor ? `${brand.name} by ${brand.vendor}` : brand.name}</p>
              <p>Version {brand.version}</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

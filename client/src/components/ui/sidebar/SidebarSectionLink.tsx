import React from 'react';
import { Link } from 'react-router-dom';
import SidebarTooltip from './SidebarTooltip';

export interface SidebarSectionLinkProps {
  to: string;
  label: string;
  /**
   * Accessible name/tooltip text used only when collapsed (icon-only, no
   * visible text). Falls back to `label`. Use this to add context that
   * would be too verbose for the terse expanded header (e.g. clarifying
   * that "Installed Apps" means installed for the caller's organization) -
   * deliberately *not* applied to the expanded text link, since overriding
   * a visible label's accessible name to different text fails WCAG 2.5.3
   * (Label in Name).
   */
  accessibleLabel?: string;
  /** Rendered only in the collapsed rail - the expanded state is a plain text header. */
  icon: React.ReactNode;
  isActive: boolean;
  isCollapsed?: boolean;
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800';

/**
 * A sidebar section heading that is also a real navigation link (e.g.
 * "Installed Apps" linking to the apps page pre-filtered to this tenant's
 * installed apps) - it *looks* like the small uppercase section headers used
 * elsewhere in the sidebar, but is keyboard-operable and carries the same
 * hover/active/focus-visible semantics as `SidebarNavItem`.
 *
 * When the rail is collapsed there's no room for the text header, so this
 * renders `icon` instead (wrapped in `SidebarTooltip`, matching how
 * `SidebarNavItem` behaves collapsed) rather than disappearing entirely.
 */
const SidebarSectionLink: React.FC<SidebarSectionLinkProps> = ({
  to,
  label,
  accessibleLabel,
  icon,
  isActive,
  isCollapsed = false,
}) => {
  if (isCollapsed) {
    const name = accessibleLabel ?? label;
    const link = (
      <Link
        to={to}
        aria-label={name}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex w-full items-center justify-center rounded-md px-2 py-2.5 transition-colors ${focusRing} ${
          isActive ? 'bg-blue-700 text-white' : 'text-gray-400 hover:bg-gray-700/80 hover:text-white'
        }`}
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>
      </Link>
    );

    return (
      <div className="pt-2">
        <SidebarTooltip label={name}>{link}</SidebarTooltip>
      </div>
    );
  }

  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`block truncate rounded-md px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${focusRing} ${
        isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </Link>
  );
};

export default SidebarSectionLink;

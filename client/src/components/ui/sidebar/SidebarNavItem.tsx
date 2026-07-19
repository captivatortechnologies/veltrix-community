import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import SidebarTooltip from './SidebarTooltip';

export interface SidebarNavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isCollapsed?: boolean;
  /** Renders a chevron and (when expanded) turns this into a disclosure button instead of a link. */
  hasSubmenu?: boolean;
  isSubmenuOpen?: boolean;
  /** id of the submenu this item controls, for aria-controls. Required when hasSubmenu is true. */
  submenuId?: string;
  /** Called instead of navigating when this item is acting as a submenu toggle (expanded + hasSubmenu). */
  onToggle?: () => void;
  className?: string;
  /** Sub-items are visually nested one level in (used for dynamic app pages). */
  indent?: boolean;
}

const baseClasses =
  'group flex w-full items-center gap-3 rounded-md py-2.5 text-sm font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800';

function stateClasses(isActive: boolean): string {
  return isActive ? 'bg-blue-700 text-white' : 'text-gray-300 hover:bg-gray-700/80 hover:text-white';
}

/**
 * A single sidebar navigation entry. Renders as a `<Link>` for normal
 * navigation, or as a `<button>` (with proper `aria-expanded`/`aria-controls`)
 * when it toggles a submenu - links that merely `preventDefault()` are not
 * accessible disclosure controls, so this keeps the semantics correct
 * without callers having to think about it.
 *
 * When collapsed, the item is wrapped in `SidebarTooltip` so its label is
 * still discoverable via hover or keyboard focus.
 */
const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  to,
  icon,
  label,
  isActive,
  isCollapsed = false,
  hasSubmenu = false,
  isSubmenuOpen = false,
  submenuId,
  onToggle,
  className = '',
  indent = false,
}) => {
  const paddingClasses = isCollapsed ? 'justify-center px-2' : indent ? 'pl-9 pr-3' : 'px-3';
  const isToggle = hasSubmenu && !isCollapsed && !!onToggle;

  const content = (
    <>
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{icon}</span>
      {!isCollapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {hasSubmenu && !isCollapsed && (
        <ChevronRight
          size={16}
          className={`flex-shrink-0 transition-transform duration-200 ${isSubmenuOpen ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      )}
    </>
  );

  // Collapsed items hide their visible text label, so they need an explicit
  // aria-label to have an accessible name at all - the floating tooltip
  // rendered by SidebarTooltip is decorative (aria-hidden) and only serves
  // sighted users, it does not supply a name to assistive tech.
  const a11yLabel = isCollapsed ? label : undefined;

  const element = isToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isSubmenuOpen}
      aria-controls={submenuId}
      aria-label={a11yLabel}
      className={`${baseClasses} ${paddingClasses} ${stateClasses(isActive)} ${className}`}
    >
      {content}
    </button>
  ) : (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      aria-label={a11yLabel}
      className={`${baseClasses} ${paddingClasses} ${stateClasses(isActive)} ${className}`}
    >
      {content}
    </Link>
  );

  if (!isCollapsed) return element;

  return <SidebarTooltip label={label}>{element}</SidebarTooltip>;
};

export default SidebarNavItem;

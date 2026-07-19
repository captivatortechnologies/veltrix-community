import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SidebarTooltipProps {
  label: string;
  /** When true, renders children unchanged (no tooltip wiring). */
  disabled?: boolean;
  children: React.ReactElement;
}

interface TooltipPosition {
  top: number;
  left: number;
}

/**
 * Lightweight, dependency-free tooltip for the collapsed sidebar rail.
 *
 * The bubble is rendered through a portal into `document.body` with
 * `position: fixed` coordinates computed from the trigger's
 * `getBoundingClientRect()`, rather than positioned inline next to the
 * trigger. This matters because the sidebar's `<nav>` scrolls vertically
 * (`overflow-y-auto`) - per the CSS overflow spec, setting one axis to a
 * non-`visible` value silently forces the *other* axis to compute as `auto`
 * too, so an inline `position: absolute; left-full` bubble (which
 * intentionally escapes the collapsed icon's own bounds to render to its
 * right) ends up clipped by the nav's own box and never actually paints.
 * Portalling to `document.body` sidesteps that clipping ancestor entirely.
 *
 * Intentionally self-contained rather than importing a shared `Tooltip`
 * component: at the time this was written the shared component library's
 * `Tooltip` didn't yet support fixed-position/portal rendering either. Once
 * it does, sidebar items can be migrated to it.
 *
 * Accessibility note: this renders a purely *visual* affordance for
 * sighted mouse/keyboard users. The caller is expected to give `children`
 * its own `aria-label` equal to `label` (icon-only links have no visible
 * text, so a floating tooltip alone would never satisfy the accessible
 * name requirement - `aria-describedby` only adds a *description*, not a
 * *name*). Because the name is already covered by `aria-label`, the
 * floating box itself is marked `aria-hidden` to avoid double-announcing
 * the same text to screen reader users.
 */
const SidebarTooltip: React.FC<SidebarTooltipProps> = ({ label, disabled = false, children }) => {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  // Hide (rather than reposition) on scroll/resize while visible - a hover/focus
  // tooltip is short-lived, so it's simpler and safer to dismiss a now-stale
  // position than to keep it glued to a trigger that may have scrolled away.
  useEffect(() => {
    if (!position) return undefined;
    const dismiss = () => setPosition(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [position]);

  if (disabled) {
    return children;
  }

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  };

  const hide = () => setPosition(null);

  const child = React.cloneElement(children, {
    onMouseEnter: (event: React.MouseEvent) => {
      show();
      children.props.onMouseEnter?.(event);
    },
    onMouseLeave: (event: React.MouseEvent) => {
      hide();
      children.props.onMouseLeave?.(event);
    },
    onFocus: (event: React.FocusEvent) => {
      show();
      children.props.onFocus?.(event);
    },
    onBlur: (event: React.FocusEvent) => {
      hide();
      children.props.onBlur?.(event);
    },
  });

  return (
    <span ref={triggerRef} className="relative flex">
      {child}
      {position &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            aria-hidden="true"
            style={{ top: position.top, left: position.left }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg ring-1 ring-black/10 dark:bg-gray-700"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
};

export default SidebarTooltip;

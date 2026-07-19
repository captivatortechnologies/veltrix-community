import React, { useEffect, useId, useRef, useState } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip text/content. If empty/undefined, the trigger renders with no tooltip behavior. */
  content?: React.ReactNode;
  placement?: TooltipPlacement;
  /** Delay (ms) before showing on hover. Focus shows immediately — keyboard users shouldn't wait. */
  delayDuration?: number;
  disabled?: boolean;
  className?: string;
  /** The single trigger element. Wrapped in an inline-flex span, not cloned, so it works
   * with any child (a native button, an icon, a disabled control wrapped in a span, …). */
  children: React.ReactNode;
}

const placementStyles: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Tooltip Component
 *
 * A minimal, dependency-free tooltip: hover OR keyboard focus reveals a short text
 * description, linked to the trigger via `aria-describedby` (per the WAI-ARIA tooltip
 * pattern) so assistive tech announces it without relying on hover alone.
 *
 * Deliberately scoped for v1 — no portal, no automatic collision detection/flipping.
 * The tooltip is positioned relative to an inline wrapper around `children`, so it can be
 * clipped by an `overflow: hidden` ancestor (e.g. a scrollable sidebar). If that becomes a
 * real problem for a specific placement, render via `createPortal` at that call site rather
 * than complicating this primitive.
 *
 * @example Icon-only nav item (sidebar)
 * <Tooltip content="Sandboxes" placement="right">
 *   <button aria-label="Sandboxes"><FlaskConical size={18} /></button>
 * </Tooltip>
 *
 * @example Disabled control (wrap in a span — a disabled element won't fire hover/focus)
 * <Tooltip content="You don't have permission to do this">
 *   <span tabIndex={0}><Button disabled>Delete</Button></span>
 * </Tooltip>
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  delayDuration = 300,
  disabled = false,
  className = '',
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tooltipId = useId();
  const isActive = !disabled && content != null && content !== '';

  useEffect(() => () => clearTimeout(showTimeoutRef.current), []);

  const show = (immediate = false) => {
    if (!isActive) return;
    clearTimeout(showTimeoutRef.current);
    if (immediate) {
      setIsVisible(true);
    } else {
      showTimeoutRef.current = setTimeout(() => setIsVisible(true), delayDuration);
    }
  };

  const hide = () => {
    clearTimeout(showTimeoutRef.current);
    setIsVisible(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') hide();
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => show()}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
      onKeyDown={handleKeyDown}
    >
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': isActive ? tooltipId : undefined,
          })
        : children}

      {isActive && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`
            pointer-events-none absolute z-30 whitespace-nowrap
            rounded-md bg-tooltip px-2 py-1 text-xs font-medium text-tooltip-foreground
            shadow-lg transition-opacity duration-150
            ${isVisible ? 'opacity-100' : 'opacity-0'}
            ${placementStyles[placement]}
          `}
        >
          {content}
        </span>
      )}
    </span>
  );
};

Tooltip.displayName = 'Tooltip';

export default Tooltip;

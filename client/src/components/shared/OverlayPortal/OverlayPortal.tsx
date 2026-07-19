import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Brand-scoped CSS custom properties that `AppShell` sets on an app's subtree
 * (`pages/apps/AppShell.tsx` → `brandVariables` + `brandTokenStyle`). A portaled
 * overlay renders at `document.body`, OUTSIDE that subtree, so these are captured
 * from an in-tree anchor and re-applied on the portal root — otherwise an app
 * dialog's primary button (`bg-primary` → `var(--color-primary)`) would fall back
 * to the platform accent instead of the app's brand color.
 *
 * Keep in sync with `AppShell.brandTokenStyle` / `AppShell.brandVariables`.
 */
export const BRAND_SCOPED_CSS_VARS = [
  '--veltrix-app-primary',
  '--veltrix-app-accent',
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-active',
  '--color-primary-foreground',
  '--color-primary-subtle',
  '--color-primary-subtle-foreground',
] as const;

export interface OverlayPortalProps {
  children: React.ReactNode;
  /**
   * Scoped CSS custom properties to copy from the mount point onto the portal
   * root, so values scoped to an ancestor subtree survive the portal. Defaults to
   * the app brand palette; pass `[]` to inherit nothing.
   */
  inheritCssVars?: readonly string[];
}

/**
 * OverlayPortal
 *
 * Renders `children` in a portal at `document.body` so a `position: fixed` overlay
 * is measured against the viewport rather than being trapped inside an ancestor
 * that establishes a containing block or clips overflow. Platform app surfaces live
 * inside `<main className="overflow-y-auto">` (see `App.tsx`), which is exactly the
 * kind of container that pins a non-portaled `fixed inset-0` overlay to the content
 * region instead of the screen — leaving a modal visibly off-centre. This mirrors
 * the portal strategy the design system already uses for `Select`, `Tooltip`, and
 * `MultiSelect`.
 *
 * Because `document.body` sits outside any app's brand-scoped subtree, the CSS
 * custom properties in `inheritCssVars` are read from an invisible in-tree anchor
 * (before the overlay is portaled out of scope) and re-applied on the portal root.
 */
export const OverlayPortal: React.FC<OverlayPortalProps> = ({
  children,
  inheritCssVars = BRAND_SCOPED_CSS_VARS,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [scopedVars, setScopedVars] = useState<React.CSSProperties>({});

  // Read the scoped brand vars from the in-tree anchor and mirror them onto the
  // portal root. useLayoutEffect (not useEffect) so the values are applied before
  // the browser paints — no flash of the un-branded accent.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === 'undefined') return;
    const computed = window.getComputedStyle(anchor);
    const next: Record<string, string> = {};
    for (const name of inheritCssVars) {
      const value = computed.getPropertyValue(name).trim();
      if (value) next[name] = value;
    }
    setScopedVars(next as React.CSSProperties);
  }, [inheritCssVars]);

  if (typeof document === 'undefined') return null;

  return (
    <>
      {/* Invisible in-tree anchor: the only element still inside the app's
          brand-scoped subtree, used to capture its CSS vars for the portal. */}
      <span ref={anchorRef} aria-hidden="true" style={{ display: 'none' }} />
      {createPortal(<div style={scopedVars}>{children}</div>, document.body)}
    </>
  );
};

OverlayPortal.displayName = 'OverlayPortal';

export default OverlayPortal;

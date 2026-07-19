import { useEffect, useState } from 'react';

const STORAGE_KEY = 'sidebar-collapsed';
// Tailwind's `lg` breakpoint - below this the icon rail is the sensible
// default so the nav doesn't eat the viewport on tablet-sized windows.
const WIDE_VIEWPORT_QUERY = '(min-width: 1024px)';

function prefersWideViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches;
}

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved !== null) return saved === 'true';
  // No explicit user preference yet: expand on wide viewports, collapse on
  // narrow ones instead of always defaulting to the icon-only rail.
  return !prefersWideViewport();
}

/**
 * Sidebar collapse/expand state, persisted to localStorage once the user
 * makes an explicit choice. Before that, the default responds to viewport
 * width so the sidebar is usable (expanded, with labels) on desktop and
 * out of the way (collapsed) on narrower windows.
 */
export function useSidebarCollapse(): [boolean, (value: boolean) => void] {
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(getInitialCollapsed);

  const setIsCollapsed = (value: boolean) => {
    setIsCollapsedState(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  };

  // If the user has never made an explicit choice, keep tracking viewport
  // changes (e.g. resizing the window) so the default stays sensible.
  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) !== null) return undefined;
    if (typeof window.matchMedia !== 'function') return undefined;

    const mql = window.matchMedia(WIDE_VIEWPORT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsCollapsedState(!event.matches);

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return [isCollapsed, setIsCollapsed];
}

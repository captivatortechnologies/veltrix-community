import React, { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface TabItem {
  /** Stable id; used for ARIA linking and as the React key. Falls back to index when omitted. */
  key?: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Uncontrolled initial tab index (ignored once `activeIndex` is provided). */
  defaultActiveIndex?: number;
  /** Controlled active tab index; pair with `onTabChange`. */
  activeIndex?: number;
  /** Called with the newly selected index, controlled or uncontrolled. */
  onTabChange?: (index: number) => void;
  /**
   * Overrides the rendered panel — most callers should rely on `tabs[].content`.
   * Kept for backward compatibility with existing call sites.
   */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Tabs Component
 *
 * Implements the WAI-ARIA tabs pattern (`role="tablist"` / `role="tab"` / `role="tabpanel"`)
 * with roving keyboard navigation:
 *   - `ArrowLeft` / `ArrowRight` move focus and select the previous/next enabled tab
 *   - `Home` / `End` jump to the first/last enabled tab
 *   - disabled tabs are skipped by keyboard navigation and unclickable
 *
 * Works uncontrolled (internal state) or controlled (`activeIndex` + `onTabChange`) — the
 * same hybrid pattern as the rest of the design system. Colors/spacing come from design
 * tokens (src/styles/tokens.css), so dark mode is automatic.
 *
 * @example
 * <Tabs
 *   tabs={[
 *     { key: 'indexes', label: 'Indexes', content: <IndexesPanel /> },
 *     { key: 'roles', label: 'Roles', content: <RolesPanel /> },
 *   ]}
 * />
 */
export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultActiveIndex = 0,
  activeIndex,
  onTabChange,
  children,
  className = '',
}) => {
  const [internalIndex, setInternalIndex] = useState(defaultActiveIndex);
  const isControlled = activeIndex !== undefined;
  const currentIndex = isControlled ? activeIndex : internalIndex;

  const idPrefix = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const firstEnabledIndex = useMemo(() => tabs.findIndex((tab) => !tab.disabled), [tabs]);
  const lastEnabledIndex = useMemo(() => {
    for (let i = tabs.length - 1; i >= 0; i -= 1) {
      if (!tabs[i].disabled) return i;
    }
    return -1;
  }, [tabs]);

  const selectTab = useCallback(
    (index: number, focusTab = false) => {
      const tab = tabs[index];
      if (!tab || tab.disabled) return;
      if (!isControlled) setInternalIndex(index);
      onTabChange?.(index);
      if (focusTab) tabRefs.current[index]?.focus();
    },
    [tabs, isControlled, onTabChange],
  );

  const moveFocus = useCallback(
    (direction: 1 | -1, from: number) => {
      if (firstEnabledIndex < 0) return;
      let next = from;
      for (let step = 0; step < tabs.length; step += 1) {
        next = (next + direction + tabs.length) % tabs.length;
        if (!tabs[next].disabled) {
          selectTab(next, true);
          return;
        }
      }
    },
    [tabs, firstEnabledIndex, selectTab],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        moveFocus(1, index);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveFocus(-1, index);
        break;
      case 'Home':
        if (firstEnabledIndex >= 0) {
          event.preventDefault();
          selectTab(firstEnabledIndex, true);
        }
        break;
      case 'End':
        if (lastEnabledIndex >= 0) {
          event.preventDefault();
          selectTab(lastEnabledIndex, true);
        }
        break;
      default:
        break;
    }
  };

  const activeTab = tabs[currentIndex];

  return (
    <div className={`w-full ${className}`}>
      <div role="tablist" aria-label="Tabs" className="flex border-b border-border">
        {tabs.map((tab, index) => {
          const tabId = `${idPrefix}-tab-${tab.key ?? index}`;
          const panelId = `${idPrefix}-panel-${tab.key ?? index}`;
          const isSelected = index === currentIndex;
          return (
            <button
              key={tab.key ?? index}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              aria-disabled={tab.disabled || undefined}
              disabled={tab.disabled}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`
                px-4 py-2 -mb-px
                font-medium text-sm
                border-b-2 transition-colors duration-150
                focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface
                disabled:opacity-50 disabled:cursor-not-allowed
                ${
                  isSelected
                    ? 'border-primary text-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab && (
        <div
          key={activeTab.key ?? currentIndex}
          id={`${idPrefix}-panel-${activeTab.key ?? currentIndex}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${activeTab.key ?? currentIndex}`}
          tabIndex={0}
          className="p-4 bg-surface-raised rounded-b-lg focus:outline-none"
        >
          {children || activeTab.content}
        </div>
      )}
    </div>
  );
};

Tabs.displayName = 'Tabs';

export default Tabs;

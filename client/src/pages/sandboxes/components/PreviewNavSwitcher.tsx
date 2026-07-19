import React from 'react'
import type { AppPageDeclaration } from '../../../../../shared/types/app'
import type { PreviewNavEntry } from '../previewNav'

export interface PreviewNavSwitcherProps {
  entries: PreviewNavEntry[]
  /** Path of the currently rendered page (either a top-level entry or one of its tabs). */
  activePath: string
  onSelect: (page: AppPageDeclaration) => void
}

const baseItemClasses =
  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary whitespace-nowrap'

/**
 * The preview's own page switcher: one row of top-level `nav: 'sidebar'`
 * pages (the manifest's declared page-switcher entries, already ordered by
 * `resolvePreviewNav`), plus a secondary tab strip for the active entry's
 * `nav: 'tab'` children (nested under their `parent`). `nav: 'hidden'` pages
 * never appear here at all — resolvePreviewNav already excludes them.
 */
export const PreviewNavSwitcher: React.FC<PreviewNavSwitcherProps> = ({ entries, activePath, onSelect }) => {
  if (entries.length === 0) return null

  const activeEntry =
    entries.find((entry) => entry.page.path === activePath) ??
    entries.find((entry) => entry.tabs.some((tab) => tab.path === activePath))

  return (
    <div className="space-y-2">
      <nav aria-label="Preview pages" className="flex flex-wrap items-center gap-1.5">
        {entries.map(({ page }) => {
          const isActive = activeEntry?.page.path === page.path
          return (
            <button
              key={page.path}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(page)}
              className={`${baseItemClasses} ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-content-secondary hover:bg-surface-hover hover:text-content-primary'
              }`}
            >
              {page.label}
            </button>
          )
        })}
      </nav>

      {activeEntry && activeEntry.tabs.length > 0 && (
        <div role="tablist" aria-label={`${activeEntry.page.label} tabs`} className="flex flex-wrap gap-1 border-b border-border pb-0">
          {[activeEntry.page, ...activeEntry.tabs].map((tabPage) => {
            const isActive = tabPage.path === activePath
            return (
              <button
                key={tabPage.path}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(tabPage)}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-content-tertiary hover:text-content-primary'
                }`}
              >
                {tabPage.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default PreviewNavSwitcher

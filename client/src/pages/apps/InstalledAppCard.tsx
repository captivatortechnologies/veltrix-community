import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '../../components/shared/Badge'
import { AppPageIcon } from '../../components/ui/sidebar/sidebarIcons'
import type { ResolvedSidebarPage } from '../../components/ui/sidebar/resolveSidebarNav'
import type { AppListItem } from '../../../../shared/types/app'

export interface InstalledAppCardProps {
  app: AppListItem
  /**
   * This app's `nav: 'sidebar'` pages, already filtered/ordered (see
   * `resolveSidebarAppGroups`) - or `null` when the app is installed but not
   * enabled. Disabled apps have no manifest data available client-side
   * (`GET /api/apps/enabled` only returns enabled apps), so `null` renders an
   * honest "enable to see pages" hint instead of a fabricated empty list.
   */
  pages: ResolvedSidebarPage[] | null
}

const sourceLabel: Record<AppListItem['source'], string> = {
  BUILT_IN: 'Built-in',
  MARKETPLACE: 'Marketplace',
  CUSTOM: 'Custom',
}

/**
 * Single app tile for InstalledAppsPage. Deliberately read-only/navigational
 * (no enable/disable/uninstall actions) - app lifecycle management stays on
 * the Marketplace page; this page's job is "find an installed app and jump
 * into it or one of its pages" at a density that still works with 50+ apps.
 */
const InstalledAppCard: React.FC<InstalledAppCardProps> = ({ app, pages }) => {
  const detailPath = `/apps/${app.appId}`

  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-5 transition-shadow hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={detailPath}
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {app.branding?.logoUrl ? (
            // Brand logo (theme-aware light/dark variants), served from the
            // app's manifest; falls back to the icon tile when absent.
            <span className="flex h-10 max-w-[7rem] flex-shrink-0 items-center" aria-hidden="true">
              <img
                src={app.branding.logoUrl}
                alt=""
                className={`h-6 w-auto max-w-full object-contain${app.branding.logoDarkUrl ? ' dark:hidden' : ''}`}
              />
              {app.branding.logoDarkUrl && (
                <img
                  src={app.branding.logoDarkUrl}
                  alt=""
                  aria-hidden="true"
                  className="hidden h-6 w-auto max-w-full object-contain dark:block"
                />
              )}
            </span>
          ) : (
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle"
              aria-hidden="true"
            >
              <AppPageIcon appIcon={app.icon} label={app.name} seed={app.appId} size={22} />
            </span>
          )}
          <span className="min-w-0">
            <h3 className="truncate font-semibold text-content-primary group-hover:text-primary">
              {app.name}
            </h3>
            <p className="truncate text-xs text-content-tertiary">
              v{app.version} &middot; {app.vendor}
            </p>
          </span>
        </Link>
        <Badge variant={app.enabled ? 'success' : 'default'} size="sm" dot className="flex-shrink-0">
          {app.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {app.description && (
        <p className="line-clamp-2 flex-1 text-sm text-content-secondary">{app.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" size="sm">
          {app.category}
        </Badge>
        {app.source !== 'BUILT_IN' && (
          <Badge variant="info" size="sm">
            {sourceLabel[app.source]}
          </Badge>
        )}
      </div>

      <div className="border-t border-border pt-3">
        {pages === null ? (
          <p className="text-xs italic text-content-tertiary">Enable this app to see its pages.</p>
        ) : pages.length === 0 ? (
          <p className="text-xs text-content-tertiary">This app declares no dedicated pages.</p>
        ) : (
          <nav aria-label={`${app.name} pages`} className="flex flex-wrap gap-1.5">
            {pages.map((page) => (
              <Link
                key={page.path}
                to={`/apps/${app.appId}${page.path}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <AppPageIcon
                  iconName={page.icon}
                  appIcon={app.icon}
                  label={page.label}
                  seed={`${app.appId}:${page.path}`}
                  size={12}
                />
                {page.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <Link
        to={detailPath}
        className="mt-1 inline-flex items-center gap-1 self-start rounded text-sm font-medium text-primary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Open app <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

export default InstalledAppCard

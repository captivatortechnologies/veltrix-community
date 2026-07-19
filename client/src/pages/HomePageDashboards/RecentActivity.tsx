import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  History,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Rocket,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState } from '../../components/shared/EmptyState'
import { Skeleton } from '../../components/shared/Skeleton'
import {
  versionControlApi,
  formatRelativeTime,
  formatTimestamp,
  getActionColorClasses,
  getActionLabel,
  getUserDisplayName,
  generateCommitMessage,
  type VersionEntry,
  type ConfigActionType,
} from '../../components/shared/VersionControl'

const ACTION_ICONS: Record<ConfigActionType, LucideIcon> = {
  CREATED: Plus,
  UPDATED: Pencil,
  DELETED: Trash2,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
  DEPLOYED: Rocket,
  REVERTED: RotateCcw,
}

const RECENT_ACTIVITY_LIMIT = 6

/**
 * Home dashboard "Recent Activity" feed.
 *
 * Real data only — pulled from GET /api/configuration-history via the shared
 * VersionControl module's `versionControlApi.getHistory()` (the same client the
 * VersionControl panel and approvals UI use elsewhere in the app). Renders a compact
 * summary rather than the full VersionTimeline/VersionTimelineItem view — that component
 * is built for a dedicated history panel (diff previews, compare mode) which is too much
 * detail for a dashboard card, but it reuses the same formatting utilities so labels,
 * relative timestamps, and commit-style messages stay consistent everywhere.
 */
const RecentActivity: React.FC = () => {
  const [entries, setEntries] = useState<VersionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    versionControlApi
      .getHistory(undefined, { page: 1, limit: RECENT_ACTIVITY_LIMIT })
      .then((res) => {
        if (!cancelled) setEntries(res.data)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load recent activity')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-content-primary">Recent Activity</h2>
      </div>
      <div className="bg-surface-raised rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-4" role="status" aria-label="Loading recent activity">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton variant="circular" width={32} height={32} />
                <div className="flex-1 space-y-2">
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="30%" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 flex items-start gap-2 text-danger text-sm">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<History size={40} aria-hidden="true" />}
            title="No activity yet"
            description="Configuration changes across your apps will show up here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const Icon = ACTION_ICONS[entry.action] ?? Pencil
              return (
                <li key={entry.id} className="p-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex-shrink-0 rounded-full p-1.5 ${getActionColorClasses(entry.action)}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-primary truncate">
                        {generateCommitMessage(entry)}
                      </p>
                      <p className="text-xs text-content-tertiary mt-0.5">
                        {getActionLabel(entry.action)} by {getUserDisplayName(entry.user)} &middot;{' '}
                        <time dateTime={entry.timestamp} title={formatTimestamp(entry.timestamp)}>
                          {formatRelativeTime(entry.timestamp)}
                        </time>
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="bg-surface-hover px-4 py-3 text-right border-t border-border">
          <Link to="/pipeline" className="text-sm font-medium text-primary hover:text-primary-hover">
            View pipeline activity
          </Link>
        </div>
      </div>
    </div>
  )
}

export default RecentActivity

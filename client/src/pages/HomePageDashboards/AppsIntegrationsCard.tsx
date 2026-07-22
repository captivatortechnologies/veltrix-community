import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Puzzle, AlertCircle, ArrowRight } from 'lucide-react'
import { Skeleton } from '../../components/shared/Skeleton'
import { appService } from '../../services/appService'
import type { AppListItem } from '../../../../shared/types/app'

/**
 * Home dashboard card summarizing the tenant's installed apps.
 *
 * Real data only — pulled from GET /api/apps (appService.listApps()). Shows a compact
 * enabled/total summary and links to the full Apps page; the per-app list itself lives
 * on the Apps page, not here. When the tenant has no apps at all this renders an honest
 * "nothing installed" state rather than a chart built on invented numbers.
 */
const AppsIntegrationsCard: React.FC = () => {
  const [apps, setApps] = useState<AppListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    appService
      .listApps()
      .then((data) => {
        if (!cancelled) setApps(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load apps')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enabledCount = apps.filter((a) => a.enabled).length

  return (
    <div className="bg-surface-raised rounded-lg shadow-md p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-content-secondary">Apps &amp; Integrations</h3>
        <Puzzle size={24} className="text-content-tertiary" aria-hidden="true" />
      </div>

      {loading ? (
        <div className="space-y-3" role="status" aria-label="Loading apps">
          <Skeleton variant="text" width="50%" height={28} />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="70%" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-danger text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center text-center py-2">
          <p className="text-sm text-content-secondary mb-3">No apps installed yet.</p>
          <Link
            to="/marketplace"
            className="inline-flex items-center justify-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
          >
            Browse the marketplace <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-content-primary">{enabledCount}</span>
            <span className="text-sm text-content-secondary">
              of {apps.length} app{apps.length === 1 ? '' : 's'} enabled
            </span>
          </div>
          <p className="mt-2 text-sm text-content-secondary">
            {apps.length - enabledCount} available to enable. Manage them below.
          </p>
        </div>
      )}

      <div className="text-center mt-4 pt-4 border-t border-border">
        <Link
          to="/apps"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
        >
          Manage apps <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

export default AppsIntegrationsCard

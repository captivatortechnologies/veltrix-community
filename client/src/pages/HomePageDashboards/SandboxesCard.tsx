import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, AlertCircle, ArrowRight } from 'lucide-react'
import { Badge, type BadgeVariant } from '../../components/shared/Badge'
import { Skeleton } from '../../components/shared/Skeleton'
import { useFeatureFlags } from '../../contexts/FeatureFlagContext'
import { sandboxApi, type Sandbox, type SandboxStatus } from '../../services/sandboxApi'

const STATUS_BADGES: Record<SandboxStatus, BadgeVariant> = {
  ACTIVE: 'success',
  SYNCING: 'info',
  ERROR: 'danger',
  EXPIRED: 'default',
}

/**
 * Home dashboard card summarizing the tenant's developer sandboxes.
 *
 * Real data only — pulled from GET /api/sandboxes. Mirrors the feature-flag gating used
 * on the Sandboxes page itself so this card never claims a capability the tenant doesn't
 * actually have.
 */
const SandboxesCard: React.FC = () => {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()
  const sandboxFeatureEnabled = isEnabled('platform.sandbox')

  useEffect(() => {
    if (flagsLoading) return
    if (!sandboxFeatureEnabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    sandboxApi
      .list()
      .then((data) => {
        if (!cancelled) setSandboxes(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sandboxes')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [flagsLoading, sandboxFeatureEnabled])

  const statusCounts = sandboxes.reduce<Partial<Record<SandboxStatus, number>>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="bg-surface-raised rounded-lg shadow-md p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-content-secondary">Sandboxes</h3>
        <FlaskConical size={24} className="text-content-tertiary" aria-hidden="true" />
      </div>

      {flagsLoading || loading ? (
        <div className="space-y-3" role="status" aria-label="Loading sandboxes">
          <Skeleton variant="text" width="50%" height={28} />
          <Skeleton variant="text" width="80%" />
        </div>
      ) : !sandboxFeatureEnabled ? (
        <div className="flex-1 flex items-center">
          <p className="text-sm text-content-secondary">
            Developer sandboxes are not enabled for this workspace yet.
          </p>
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 text-danger text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : sandboxes.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center text-center py-2">
          <p className="text-sm text-content-secondary mb-1">No sandboxes yet.</p>
          <p className="text-xs text-content-tertiary">
            Create one from the Veltrix CLI to develop an app locally.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold text-content-primary">{sandboxes.length}</span>
            <span className="text-sm text-content-secondary">
              sandbox{sandboxes.length === 1 ? '' : 'es'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 flex-1 content-start">
            {(Object.keys(statusCounts) as SandboxStatus[]).map((status) => (
              <Badge key={status} variant={STATUS_BADGES[status]} size="sm" dot>
                {statusCounts[status]} {status.charAt(0) + status.slice(1).toLowerCase()}
              </Badge>
            ))}
          </div>
        </>
      )}

      {sandboxFeatureEnabled && (
        <div className="text-center mt-4 pt-4 border-t border-border">
          <Link
            to="/sandboxes"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-hover"
          >
            Manage sandboxes <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  )
}

export default SandboxesCard

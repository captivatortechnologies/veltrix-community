import React from 'react'
import { Loader2, Rocket, SearchCheck, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Badge, type BadgeVariant } from '@/components/shared/Badge'
import { Alert } from '@/components/shared/Alert'
import { EmptyState } from '@/components/shared/EmptyState'
import { DriftDiffTable, DRIFT_SEVERITY_CONFIG } from '@/components/shared/Pipeline'
import type { DriftRecord, DriftSeverity } from '@/components/shared/Pipeline'

export interface ConfigDriftPanelProps {
  /** All drift records for this canvas (resolved + unresolved). */
  records: DriftRecord[]
  /** The subset still needing attention — what gets listed as action items. */
  unresolved: DriftRecord[]
  loading: boolean
  error: string | null
  checking: boolean
  busy: { id: string; action: 'correct' | 'acknowledge' } | null
  onCheckNow: () => Promise<void>
  onCorrect: (record: DriftRecord) => Promise<void>
  onAcknowledge: (record: DriftRecord) => Promise<void>
}

const SEVERITY_BADGE: Record<DriftSeverity, BadgeVariant> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
}

function countBySeverity(records: DriftRecord[], severity: DriftSeverity): number {
  return records.filter((r) => r.severity === severity).length
}

/**
 * Configuration Drift tab content for ConfigDetailsModal. Shows the overall
 * drift status for this ONE configuration, a "Check drift now" action, and
 * per-record diffs (with who/when attribution) plus Correct / Acknowledge.
 * Purely presentational — all fetching/state lives in `useConfigDrift`.
 */
export const ConfigDriftPanel: React.FC<ConfigDriftPanelProps> = ({
  unresolved,
  loading,
  error,
  checking,
  busy,
  onCheckNow,
  onCorrect,
  onAcknowledge,
}) => {
  const inSync = !loading && !error && unresolved.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {loading ? null : inSync ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
              <ShieldCheck className="h-5 w-5" /> In sync
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {unresolved.length} unresolved
              </span>
              {(['critical', 'warning', 'info'] as DriftSeverity[]).map((severity) => {
                const count = countBySeverity(unresolved, severity)
                if (count === 0) return null
                return (
                  <Badge key={severity} variant={SEVERITY_BADGE[severity]} size="sm">
                    {count} {DRIFT_SEVERITY_CONFIG[severity].label.toLowerCase()}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          isLoading={checking}
          loadingText="Checking…"
          leftIcon={<SearchCheck className="h-4 w-4" />}
          onClick={() => void onCheckNow()}
        >
          Check drift now
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-10" role="status" aria-label="Loading configuration drift">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        </div>
      ) : inSync ? (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-green-500" />}
          title="In sync — no drift detected"
          description="The deployed configuration matches the approved version."
        />
      ) : (
        <ul className="space-y-3">
          {unresolved.map((record) => (
            <ConfigDriftRecordCard
              key={record.id}
              record={record}
              busyAction={busy?.id === record.id ? busy.action : null}
              onCorrect={() => void onCorrect(record)}
              onAcknowledge={() => void onAcknowledge(record)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface ConfigDriftRecordCardProps {
  record: DriftRecord
  busyAction: 'correct' | 'acknowledge' | null
  onCorrect: () => void
  onAcknowledge: () => void
}

const ConfigDriftRecordCard: React.FC<ConfigDriftRecordCardProps> = ({
  record,
  busyAction,
  onCorrect,
  onAcknowledge,
}) => {
  const style = DRIFT_SEVERITY_CONFIG[record.severity]
  const Icon = style.icon
  const anyBusy = busyAction !== null

  return (
    <li className={`rounded-lg border ${style.borderColor} ${style.bgColor} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 ${style.textColor}`} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${style.textColor}`}>{style.label} drift</span>
              <Badge variant="secondary" size="sm">
                {record.environment?.name ?? 'Unknown environment'}
              </Badge>
              <Badge variant="secondary" size="sm">
                {record.component?.hostname ?? 'Unknown component'}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Detected {new Date(record.detectedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={anyBusy}
            isLoading={busyAction === 'acknowledge'}
            onClick={onAcknowledge}
          >
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={anyBusy}
            isLoading={busyAction === 'correct'}
            loadingText="Correcting…"
            leftIcon={<Rocket className="h-3.5 w-3.5" />}
            onClick={onCorrect}
          >
            Correct
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
        <DriftDiffTable diffs={record.diffs} />
      </div>
    </li>
  )
}

export default ConfigDriftPanel

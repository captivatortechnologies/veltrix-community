import React, { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle, UserRound } from 'lucide-react'
import type { DriftDiff, DriftRecord } from '../api/pipelineApi'
import { DRIFT_SEVERITY_CONFIG } from './severityConfig'
import { DriftDiffTable } from './DriftDiffTable'

interface DriftAlertProps {
  drift: DriftRecord
  onResolve?: (driftId: string, action: string) => void
}

/** ISO -> local time, falling back to the raw string. */
function formatWhen(at?: string): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString()
}

/**
 * Roll a record's per-diff actor attribution up to one "who + when" summary for the
 * always-visible header: the most recent attributed change, plus a count of any other
 * distinct people. Returns null when no diff could be attributed (the full per-field
 * breakdown still lives in the expanded DriftDiffTable's "Changed by" column).
 */
function summarizeActor(diffs: DriftDiff[]): { name: string; email?: string; when: string; others: number } | null {
  const actors = diffs.map((d) => d.actor).filter((a): a is NonNullable<DriftDiff['actor']> => Boolean(a?.name))
  if (actors.length === 0) return null
  const primary = actors.reduce((a, b) => ((b.at ?? '') > (a.at ?? '') ? b : a))
  const distinct = new Set(actors.map((a) => a.name))
  return {
    name: primary.name!,
    email: primary.email,
    when: formatWhen(primary.at),
    others: Math.max(0, distinct.size - 1),
  }
}

const DriftAlert: React.FC<DriftAlertProps> = ({ drift, onResolve }) => {
  const [expanded, setExpanded] = useState(false)
  const config = DRIFT_SEVERITY_CONFIG[drift.severity]
  const Icon = config.icon
  const actor = summarizeActor(drift.diffs)

  return (
    <div className={`rounded-lg border ${config.borderColor} ${config.bgColor} p-4`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 ${config.textColor}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${config.textColor}`}>
                Configuration Drift - {config.label}
              </span>
              {drift.isResolved && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  <CheckCircle className="w-3 h-3" /> Resolved
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {drift.component?.hostname ?? 'Unknown component'} &middot;{' '}
              {drift.environment?.name ?? 'Unknown environment'} &middot; {drift.diffs.length} change
              {drift.diffs.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Detected {new Date(drift.detectedAt).toLocaleString()}
            </p>
            {actor && (
              <p
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                title={actor.email}
              >
                <UserRound className="w-3 h-3 flex-shrink-0" />
                <span>
                  Changed by <span className="font-medium text-gray-700 dark:text-gray-300">{actor.name}</span>
                  {actor.others > 0 && ` +${actor.others} other${actor.others === 1 ? '' : 's'}`}
                  {actor.when && ` · ${actor.when}`}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!drift.isResolved && onResolve && (
            <button
              onClick={() => onResolve(drift.id, 'acknowledged')}
              className="text-xs px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Acknowledge
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded diffs */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <DriftDiffTable diffs={drift.diffs} />
        </div>
      )}
    </div>
  )
}

export default DriftAlert

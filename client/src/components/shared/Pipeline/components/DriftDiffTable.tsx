import React from 'react'
import { Tooltip } from '@/components/shared/Tooltip'
import type { DriftDiff } from '../api/pipelineApi'
import { DRIFT_SEVERITY_CONFIG } from './severityConfig'

export interface DriftDiffTableProps {
  diffs: DriftDiff[]
  className?: string
}

/** Formats an ISO timestamp for display, falling back to the raw string if unparsable. */
function formatWhen(at?: string): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? at : d.toLocaleString()
}

/**
 * Render a drift value readably: objects/arrays as compact JSON (not
 * "[object Object]"), empty/absent as an explicit placeholder, primitives as-is.
 * Both the previous (approved) and current (live) values pass through this so the
 * "what changed" comparison is always legible.
 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '(none)'
  if (typeof v === 'string') return v === '' ? '(empty)' : v
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Field / Previous (approved) / Current (live) / Severity / Changed-by table for a
 * drift record's diffs — an explicit previous-vs-current comparison of exactly what
 * changed. Shared by DriftAlert (the standalone Drift page) and the configuration
 * details modal's Drift tab so both surfaces stay visually consistent.
 *
 * "Changed by" surfaces the best-effort actor attribution the server may attach
 * to a diff (`diff.actor`) — who made the manual change and when. It renders a
 * subtle "—" when no actor could be attributed.
 */
export const DriftDiffTable: React.FC<DriftDiffTableProps> = ({ diffs, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 dark:text-gray-400">
          <th className="text-left py-1 pr-3 font-medium">Field</th>
          <th className="text-left py-1 pr-3 font-medium">Previous (approved)</th>
          <th className="text-left py-1 pr-3 font-medium">Current (live)</th>
          <th className="text-left py-1 pr-3 font-medium">Severity</th>
          <th className="text-left py-1 font-medium">Changed by</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
        {diffs.map((diff, i) => {
          const severityStyle = DRIFT_SEVERITY_CONFIG[diff.severity]
          const actor = diff.actor
          const when = formatWhen(actor?.at)
          return (
            <tr key={i}>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 font-mono align-top">{diff.field}</td>
              <td className="py-1.5 pr-3 text-green-700 dark:text-green-400 font-mono align-top whitespace-pre-wrap break-words max-w-xs">
                {formatValue(diff.expected)}
              </td>
              <td className="py-1.5 pr-3 text-red-600 dark:text-red-400 font-mono align-top whitespace-pre-wrap break-words max-w-xs">
                {formatValue(diff.actual)}
              </td>
              <td className="py-1.5 pr-3">
                <span className={severityStyle.textColor}>{diff.severity}</span>
              </td>
              <td className="py-1.5">
                {actor?.name ? (
                  <Tooltip content={actor.email}>
                    <span className="text-gray-700 dark:text-gray-300">
                      {actor.name}
                      {when && (
                        <span className="block text-[11px] text-gray-400 dark:text-gray-500">
                          {when}
                        </span>
                      )}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500" title="No attribution available">
                    &mdash;
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

export default DriftDiffTable

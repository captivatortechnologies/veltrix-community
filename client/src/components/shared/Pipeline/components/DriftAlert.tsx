import React, { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'
import type { DriftRecord } from '../api/pipelineApi'
import { DRIFT_SEVERITY_CONFIG } from './severityConfig'
import { DriftDiffTable } from './DriftDiffTable'

interface DriftAlertProps {
  drift: DriftRecord
  onResolve?: (driftId: string, action: string) => void
}

const DriftAlert: React.FC<DriftAlertProps> = ({ drift, onResolve }) => {
  const [expanded, setExpanded] = useState(false)
  const config = DRIFT_SEVERITY_CONFIG[drift.severity]
  const Icon = config.icon

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
              {new Date(drift.detectedAt).toLocaleString()}
            </p>
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

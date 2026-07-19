import React, { useState } from 'react'
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'
import type { DriftRecord, DriftSeverity } from '../api/pipelineApi'

interface DriftAlertProps {
  drift: DriftRecord
  onResolve?: (driftId: string, action: string) => void
}

const SEVERITY_CONFIG: Record<
  DriftSeverity,
  {
    icon: React.ElementType
    bgColor: string
    textColor: string
    borderColor: string
    label: string
  }
> = {
  critical: {
    icon: AlertTriangle,
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    label: 'Warning',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Info',
  },
}

const DriftAlert: React.FC<DriftAlertProps> = ({ drift, onResolve }) => {
  const [expanded, setExpanded] = useState(false)
  const config = SEVERITY_CONFIG[drift.severity]
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
              {drift.component.hostname} &middot; {drift.environment.name} &middot;{' '}
              {drift.diffs.length} change{drift.diffs.length !== 1 ? 's' : ''} detected
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
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400">
                <th className="text-left py-1 pr-3 font-medium">Field</th>
                <th className="text-left py-1 pr-3 font-medium">Expected</th>
                <th className="text-left py-1 pr-3 font-medium">Actual</th>
                <th className="text-left py-1 font-medium">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {drift.diffs.map((diff, i) => {
                const diffConfig = SEVERITY_CONFIG[diff.severity]
                return (
                  <tr key={i}>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 font-mono">
                      {diff.field}
                    </td>
                    <td className="py-1.5 pr-3 text-green-600 dark:text-green-400 font-mono">
                      {String(diff.expected)}
                    </td>
                    <td className="py-1.5 pr-3 text-red-600 dark:text-red-400 font-mono">
                      {String(diff.actual)}
                    </td>
                    <td className="py-1.5">
                      <span className={`${diffConfig.textColor}`}>{diff.severity}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default DriftAlert

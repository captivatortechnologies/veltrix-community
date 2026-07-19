import React from 'react'
import { HeartPulse, AlertTriangle, Server, RotateCcw } from 'lucide-react'
import DeploymentStatusBadge from './DeploymentStatusBadge'
import type { Deployment } from '../api/pipelineApi'

interface DeploymentProgressProps {
  deployment: Deployment
  onPause?: () => void
  onResume?: () => void
  onRollback?: () => void
}

const DeploymentProgress: React.FC<DeploymentProgressProps> = ({
  deployment,
  onPause,
  onResume,
  onRollback,
}) => {
  const isActive = ['IN_PROGRESS', 'HEALTH_CHECKING'].includes(deployment.status)
  const isPaused = deployment.status === 'PAUSED'
  const isComplete = ['SUCCEEDED', 'FAILED', 'ROLLED_BACK'].includes(deployment.status)

  const strategyLabel = {
    DIRECT: 'Direct Deploy',
    CANARY: 'Canary',
    BLUE_GREEN: 'Blue/Green',
    ROLLING: 'Rolling',
  }[deployment.strategy]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <DeploymentStatusBadge status={deployment.status} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {strategyLabel}
          </span>
          {deployment.environment && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {deployment.environment.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isActive && onPause && (
            <button
              onClick={onPause}
              className="text-xs px-2 py-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              Pause
            </button>
          )}
          {isPaused && onResume && (
            <button
              onClick={onResume}
              className="text-xs px-2 py-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              Resume
            </button>
          )}
          {isComplete && deployment.status === 'SUCCEEDED' && onRollback && (
            <button
              onClick={onRollback}
              className="text-xs px-2 py-1 rounded text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Rollback
            </button>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        {deployment.canaryPercent !== null && deployment.canaryPercent !== undefined && (
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Canary</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {deployment.canaryPercent}%
              </p>
            </div>
          </div>
        )}
        {deployment.healthScore !== null && deployment.healthScore !== undefined && (
          <div className="flex items-center gap-2">
            <HeartPulse className={`w-4 h-4 ${
              deployment.healthScore >= 80
                ? 'text-green-500'
                : deployment.healthScore >= 50
                  ? 'text-yellow-500'
                  : 'text-red-500'
            }`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Health</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {deployment.healthScore}%
              </p>
            </div>
          </div>
        )}
        {deployment.errorRate !== null && deployment.errorRate !== undefined && (
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${
              deployment.errorRate > 5 ? 'text-red-500' : 'text-gray-400'
            }`} />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Error Rate</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {deployment.errorRate.toFixed(1)}%
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar for canary */}
      {deployment.strategy === 'CANARY' && deployment.canaryPercent !== null && deployment.canaryPercent !== undefined && (
        <div className="mb-3">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                deployment.status === 'FAILED' ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${deployment.canaryPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Deployment logs */}
      {deployment.logs && deployment.logs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Recent logs
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {deployment.logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 text-xs"
              >
                <span className="text-gray-400 dark:text-gray-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={
                  log.level === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : log.level === 'warn'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-600 dark:text-gray-300'
                }>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: triggered by + timing */}
      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        {deployment.triggeredBy && (
          <span>by {deployment.triggeredBy.name || deployment.triggeredBy.email}</span>
        )}
        <span>{new Date(deployment.createdAt).toLocaleString()}</span>
      </div>
    </div>
  )
}

export default DeploymentProgress

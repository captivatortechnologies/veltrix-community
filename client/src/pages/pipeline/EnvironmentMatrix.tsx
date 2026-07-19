import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Grid3X3,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  ArrowRightCircle,
  Minus,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import PipelineNav from './PipelineNav'
import {
  PipelineStatusBadge,
  pipelineApi,
} from '../../components/shared/Pipeline'
import type {
  EnvironmentMatrixResponse,
  DeploymentStatus,
} from '../../components/shared/Pipeline'

const statusIcon: Record<DeploymentStatus, React.ReactNode> = {
  QUEUED: <Clock className="w-4 h-4 text-gray-400" />,
  IN_PROGRESS: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  HEALTH_CHECKING: <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />,
  PAUSED: <Pause className="w-4 h-4 text-yellow-500" />,
  SUCCEEDED: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  FAILED: <XCircle className="w-4 h-4 text-red-500" />,
  ROLLING_BACK: <ArrowRightCircle className="w-4 h-4 text-orange-500" />,
  ROLLED_BACK: <AlertTriangle className="w-4 h-4 text-orange-500" />,
}

const EnvironmentMatrix: React.FC = () => {
  const [data, setData] = useState<EnvironmentMatrixResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await pipelineApi.getEnvironmentMatrix()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environment matrix')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredMatrix = data?.matrix.filter((row) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      row.canvas.name.toLowerCase().includes(q) ||
      row.canvas.toolType.toLowerCase().includes(q) ||
      row.canvas.entityType.toLowerCase().includes(q)
    )
  })

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PipelineNav />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Grid3X3 className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Environment Matrix
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              What&apos;s deployed where across all environments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter canvases..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Matrix Table */}
      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : data && data.environments.length > 0 && filteredMatrix ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 min-w-[240px]">
                  Configuration Canvas
                </th>
                {data.environments.map((env) => (
                  <th
                    key={env.id}
                    className="text-center px-4 py-3 font-semibold text-gray-900 dark:text-white min-w-[150px]"
                  >
                    {env.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredMatrix.length === 0 ? (
                <tr>
                  <td
                    colSpan={data.environments.length + 1}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No canvases match your filter
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((row) => (
                  <tr key={row.canvas.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    {/* Canvas info column */}
                    <td className="px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10">
                      <div className="flex flex-col gap-1">
                        <Link
                          to={`/tools-integration`}
                          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {row.canvas.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {row.canvas.toolType} / {row.canvas.entityType}
                          </span>
                          <PipelineStatusBadge status={row.canvas.status} size="sm" />
                        </div>
                      </div>
                    </td>

                    {/* Environment cells */}
                    {row.environments.map((env) => (
                      <td key={env.environmentId} className="px-4 py-3 text-center">
                        {env.deployment ? (
                          <MatrixCell deployment={env.deployment} />
                        ) : (
                          <div className="flex items-center justify-center">
                            <Minus className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <Grid3X3 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">No deployment data yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            Deploy configuration canvases to see the environment matrix
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Legend</h3>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Succeeded
          </span>
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 text-blue-500" /> In Progress
          </span>
          <span className="flex items-center gap-1.5">
            <Pause className="w-3.5 h-3.5 text-yellow-500" /> Paused
          </span>
          <span className="flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-500" /> Failed
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowRightCircle className="w-3.5 h-3.5 text-orange-500" /> Rolling Back
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400" /> Queued
          </span>
          <span className="flex items-center gap-1.5">
            <Minus className="w-3.5 h-3.5 text-gray-300" /> Not Deployed
          </span>
        </div>
      </div>
    </div>
  )
}

interface MatrixCellProps {
  deployment: {
    id: string
    status: DeploymentStatus
    strategy: DeploymentStrategy
    healthScore: number | null
    startedAt: string
    completedAt: string | null
  }
}

import type { DeploymentStrategy } from '../../components/shared/Pipeline'

const MatrixCell: React.FC<MatrixCellProps> = ({ deployment }) => {
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        {statusIcon[deployment.status]}
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {deployment.status === 'SUCCEEDED' ? 'Live' : deployment.status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500">
        <span>{deployment.strategy}</span>
        {deployment.healthScore !== null && (
          <span
            className={
              deployment.healthScore >= 90
                ? 'text-emerald-500'
                : deployment.healthScore >= 70
                  ? 'text-yellow-500'
                  : 'text-red-500'
            }
          >
            {deployment.healthScore}%
          </span>
        )}
      </div>
      <span className="text-[10px] text-gray-400 dark:text-gray-500">
        {timeAgo(deployment.completedAt || deployment.startedAt)}
      </span>
    </div>
  )
}

export default EnvironmentMatrix

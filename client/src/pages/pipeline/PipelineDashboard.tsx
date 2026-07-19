import React, { useState, useEffect } from 'react'
import { Shield, RefreshCw, AlertTriangle, Clock, Rocket, XCircle } from 'lucide-react'
import PipelineNav from './PipelineNav'
import {
  PipelineSummaryCards,
  DriftAlert,
  pipelineApi,
} from '../../components/shared/Pipeline'
import type {
  PipelineSummary,
  DriftRecord,
} from '../../components/shared/Pipeline'

const PipelineDashboard: React.FC = () => {
  const [summary, setSummary] = useState<PipelineSummary>({
    pendingValidations: 0,
    pendingApprovals: 0,
    activeDeployments: 0,
    failedDeployments: 0,
    unresolvedDrifts: 0,
  })
  const [driftRecords, setDriftRecords] = useState<DriftRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [summaryData, driftData] = await Promise.all([
        pipelineApi.getSummary(),
        pipelineApi.getDriftRecords({ isResolved: false, limit: 10 }),
      ])
      setSummary(summaryData)
      setDriftRecords(driftData.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleResolveDrift = async (driftId: string, action: string) => {
    try {
      await pipelineApi.resolveDrift(driftId, action)
      setDriftRecords((prev) => prev.filter((d) => d.id !== driftId))
      setSummary((prev) => ({
        ...prev,
        unresolvedDrifts: Math.max(0, prev.unresolvedDrifts - 1),
      }))
    } catch (err) {
      console.error('Failed to resolve drift:', err)
    }
  }

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
          <Shield className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Security-as-Code Pipeline
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Overview of all pipeline activity across apps
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <PipelineSummaryCards summary={summary} loading={loading} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drift Alerts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Configuration Drift
            </h2>
            {driftRecords.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                {driftRecords.length} unresolved
              </span>
            )}
          </div>

          {driftRecords.length === 0 && !loading ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
              <Shield className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-green-700 dark:text-green-300 font-medium">No drift detected</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                All deployed configurations match their approved versions
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {driftRecords.map((drift) => (
                <DriftAlert
                  key={drift.id}
                  drift={drift}
                  onResolve={handleResolveDrift}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pipeline Activity */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Rocket className="w-5 h-5 text-blue-500" />
            Pipeline Activity
          </h2>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {/* Pending Approvals */}
            <ActivityRow
              icon={<Clock className="w-4 h-4 text-yellow-500" />}
              label="Pending Approvals"
              count={summary.pendingApprovals}
              color="text-yellow-600 dark:text-yellow-400"
            />
            {/* Active Deployments */}
            <ActivityRow
              icon={<Rocket className="w-4 h-4 text-blue-500" />}
              label="Active Deployments"
              count={summary.activeDeployments}
              color="text-blue-600 dark:text-blue-400"
            />
            {/* Failed Deployments */}
            <ActivityRow
              icon={<XCircle className="w-4 h-4 text-red-500" />}
              label="Failed Deployments"
              count={summary.failedDeployments}
              color="text-red-600 dark:text-red-400"
            />
            {/* Drift Alerts */}
            <ActivityRow
              icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
              label="Drift Alerts"
              count={summary.unresolvedDrifts}
              color="text-orange-600 dark:text-orange-400"
            />
          </div>

          {/* Pipeline Stages Legend */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              Pipeline Stages
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" /> Draft
              </span>
              <span>&rarr;</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Validate
              </span>
              <span>&rarr;</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" /> Approve
              </span>
              <span>&rarr;</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" /> Deploy
              </span>
              <span>&rarr;</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Live
              </span>
              <span>&rarr;</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Monitor
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ActivityRowProps {
  icon: React.ReactNode
  label: string
  count: number
  color: string
}

const ActivityRow: React.FC<ActivityRowProps> = ({ icon, label, count, color }) => (
  <div className="flex items-center justify-between px-4 py-3">
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </div>
    <span className={`text-lg font-bold ${count > 0 ? color : 'text-gray-400 dark:text-gray-500'}`}>
      {count}
    </span>
  </div>
)

export default PipelineDashboard

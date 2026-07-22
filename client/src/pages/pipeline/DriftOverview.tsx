import React, { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  RefreshCw,
  Filter,
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  SearchCheck,
} from 'lucide-react'
import PipelineNav from './PipelineNav'
import {
  DriftAlert,
  pipelineApi,
} from '../../components/shared/Pipeline'
import type {
  DriftRecord,
  DriftSeverity,
  PaginatedResponse,
} from '../../components/shared/Pipeline'
import { useToast } from '../../components/shared/Toast'

type ResolvedFilter = 'unresolved' | 'resolved' | 'all'

const DriftOverview: React.FC = () => {
  const toast = useToast()
  const [driftData, setDriftData] = useState<PaginatedResponse<DriftRecord> | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>('unresolved')
  const [page, setPage] = useState(1)
  const limit = 15

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const isResolved = resolvedFilter === 'all' ? undefined : resolvedFilter === 'resolved'
      const result = await pipelineApi.getDriftRecords({ isResolved, page, limit })
      setDriftData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drift data')
    } finally {
      setLoading(false)
    }
  }, [resolvedFilter, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCheckNow = useCallback(async () => {
    setChecking(true)
    try {
      const result = await pipelineApi.detectDrift()
      await fetchData()
      toast.success(
        `Checked — ${result.unresolved} unresolved drift record${result.unresolved !== 1 ? 's' : ''}.`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check for drift')
    } finally {
      setChecking(false)
    }
  }, [fetchData, toast])

  const handleResolveDrift = async (driftId: string, action: string) => {
    try {
      await pipelineApi.resolveDrift(driftId, action)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve drift')
    }
  }

  const handleFilterChange = (filter: ResolvedFilter) => {
    setResolvedFilter(filter)
    setPage(1)
  }

  // Count by severity
  const countBySeverity = (severity: DriftSeverity) =>
    driftData?.data.filter((d) => d.severity === severity).length ?? 0

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
          <AlertTriangle className="w-7 h-7 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Configuration Drift
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Monitor and resolve configuration drift across environments
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleCheckNow()}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
          >
            {checking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SearchCheck className="w-4 h-4" />
            )}
            Check drift now
          </button>
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

      {/* Severity Summary */}
      {driftData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SeverityCard
            severity="critical"
            count={countBySeverity('critical')}
            color="red"
          />
          <SeverityCard
            severity="warning"
            count={countBySeverity('warning')}
            color="yellow"
          />
          <SeverityCard
            severity="info"
            count={countBySeverity('info')}
            color="blue"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(['unresolved', 'resolved', 'all'] as ResolvedFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                resolvedFilter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {driftData && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {driftData.pagination.total} record{driftData.pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Drift Records */}
      {loading && !driftData ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : driftData && driftData.data.length > 0 ? (
        <div className="space-y-3">
          {driftData.data.map((drift) => (
            <DriftAlert
              key={drift.id}
              drift={drift}
              onResolve={handleResolveDrift}
            />
          ))}
        </div>
      ) : (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-8 text-center">
          <Shield className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-green-700 dark:text-green-300 font-medium text-lg">
            {resolvedFilter === 'unresolved'
              ? 'No unresolved drift detected'
              : resolvedFilter === 'resolved'
                ? 'No resolved drift records'
                : 'No drift records found'}
          </p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            All deployed configurations match their approved versions
          </p>
        </div>
      )}

      {/* Pagination */}
      {driftData && driftData.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {driftData.pagination.page} of {driftData.pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(driftData.pagination.totalPages, p + 1))}
              disabled={page >= driftData.pagination.totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SeverityCardProps {
  severity: DriftSeverity
  count: number
  color: 'red' | 'yellow' | 'blue'
}

const colorClasses = {
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-500',
    count: 'text-red-700 dark:text-red-300',
    label: 'text-red-600 dark:text-red-400',
  },
  yellow: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-500',
    count: 'text-yellow-700 dark:text-yellow-300',
    label: 'text-yellow-600 dark:text-yellow-400',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
    count: 'text-blue-700 dark:text-blue-300',
    label: 'text-blue-600 dark:text-blue-400',
  },
}

const SeverityCard: React.FC<SeverityCardProps> = ({ severity, count, color }) => {
  const c = colorClasses[color]
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-4 flex items-center gap-3`}>
      <AlertTriangle className={`w-5 h-5 ${c.icon}`} />
      <div>
        <p className={`text-2xl font-bold ${c.count}`}>{count}</p>
        <p className={`text-xs capitalize ${c.label}`}>{severity}</p>
      </div>
    </div>
  )
}

export default DriftOverview

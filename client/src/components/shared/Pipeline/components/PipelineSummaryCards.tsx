import React from 'react'
import {
  Clock,
  Rocket,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import type { PipelineSummary } from '../api/pipelineApi'

interface PipelineSummaryCardsProps {
  summary: PipelineSummary
  loading?: boolean
}

const PipelineSummaryCards: React.FC<PipelineSummaryCardsProps> = ({
  summary,
  loading = false,
}) => {
  const cards = [
    {
      label: 'Pending Approvals',
      value: summary.pendingApprovals,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      label: 'Active Deployments',
      value: summary.activeDeployments,
      icon: Rocket,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Failed Deployments',
      value: summary.failedDeployments,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Drift Alerts',
      value: summary.unresolvedDrifts,
      icon: AlertTriangle,
      color: summary.unresolvedDrifts > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: summary.unresolvedDrifts > 0
        ? 'bg-red-50 dark:bg-red-900/20'
        : 'bg-green-50 dark:bg-green-900/20',
    },
  ]

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-3" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-100 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className={`text-2xl font-bold mt-1 ${
                  card.value > 0 ? card.color : 'text-gray-900 dark:text-white'
                }`}>
                  {card.value}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PipelineSummaryCards

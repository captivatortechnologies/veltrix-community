import React from 'react'
import {
  Loader2,
  Activity,
  HeartPulse,
  Pause,
  CheckCheck,
  XCircle,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import type { DeploymentStatus } from '../api/pipelineApi'

interface DeploymentStatusBadgeProps {
  status: DeploymentStatus
  size?: 'sm' | 'md'
}

const STATUS_CONFIG: Record<
  DeploymentStatus,
  {
    label: string
    icon: React.ElementType
    bgColor: string
    textColor: string
    animate?: boolean
  }
> = {
  QUEUED: {
    label: 'Queued',
    icon: Loader2,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-600 dark:text-gray-300',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    icon: Activity,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    animate: true,
  },
  HEALTH_CHECKING: {
    label: 'Health Check',
    icon: HeartPulse,
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-700 dark:text-purple-300',
    animate: true,
  },
  PAUSED: {
    label: 'Paused',
    icon: Pause,
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-300',
  },
  SUCCEEDED: {
    label: 'Succeeded',
    icon: CheckCheck,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-300',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
  },
  ROLLING_BACK: {
    label: 'Rolling Back',
    icon: RotateCcw,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
    animate: true,
  },
  ROLLED_BACK: {
    label: 'Rolled Back',
    icon: Undo2,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
  },
}

const DeploymentStatusBadge: React.FC<DeploymentStatusBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs gap-1'
    : 'px-2 py-1 text-xs gap-1.5'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'

  return (
    <span
      className={`inline-flex items-center ${sizeClasses} font-medium rounded-full ${config.bgColor} ${config.textColor}`}
    >
      <Icon className={`${iconSize} ${config.animate ? 'animate-pulse' : ''}`} />
      {config.label}
    </span>
  )
}

export default DeploymentStatusBadge

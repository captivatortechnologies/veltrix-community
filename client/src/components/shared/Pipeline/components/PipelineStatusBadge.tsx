import React from 'react'
import {
  FileEdit,
  Search,
  XCircle,
  Clock,
  CheckCircle,
  Loader2,
  Rocket,
  Pause,
  CheckCheck,
  AlertTriangle,
  RotateCcw,
  Archive,
  MessageSquareWarning,
  HelpCircle,
} from 'lucide-react'
import type { ConfigCanvasStatus } from '../api/pipelineApi'

interface PipelineStatusBadgeProps {
  status: ConfigCanvasStatus
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  showLabel?: boolean
  pulse?: boolean
}

const STATUS_CONFIG: Record<
  ConfigCanvasStatus,
  {
    label: string
    icon: React.ElementType
    bgColor: string
    textColor: string
    borderColor: string
    animate?: boolean
  }
> = {
  DRAFT: {
    label: 'Draft',
    icon: FileEdit,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-600 dark:text-gray-300',
    borderColor: 'border-gray-200 dark:border-gray-700',
  },
  VALIDATION_PENDING: {
    label: 'Validating',
    icon: Search,
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800',
    animate: true,
  },
  VALIDATION_FAILED: {
    label: 'Validation Failed',
    icon: XCircle,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
  },
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    icon: Clock,
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    textColor: 'text-yellow-700 dark:text-yellow-300',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
  },
  CHANGES_REQUESTED: {
    label: 'Changes Requested',
    icon: MessageSquareWarning,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
  APPROVED: {
    label: 'Approved',
    icon: CheckCircle,
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-300',
    borderColor: 'border-green-200 dark:border-green-800',
  },
  DEPLOYMENT_QUEUED: {
    label: 'Queued',
    icon: Loader2,
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    textColor: 'text-indigo-700 dark:text-indigo-300',
    borderColor: 'border-indigo-200 dark:border-indigo-800',
  },
  DEPLOYING: {
    label: 'Deploying',
    icon: Rocket,
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    textColor: 'text-purple-700 dark:text-purple-300',
    borderColor: 'border-purple-200 dark:border-purple-800',
    animate: true,
  },
  DEPLOYMENT_PAUSED: {
    label: 'Paused',
    icon: Pause,
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  DEPLOYED: {
    label: 'Deployed',
    icon: CheckCheck,
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  DEPLOYMENT_FAILED: {
    label: 'Deploy Failed',
    icon: AlertTriangle,
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-200 dark:border-red-800',
  },
  ROLLED_BACK: {
    label: 'Rolled Back',
    icon: RotateCcw,
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    textColor: 'text-orange-700 dark:text-orange-300',
    borderColor: 'border-orange-200 dark:border-orange-800',
  },
  ARCHIVED: {
    label: 'Archived',
    icon: Archive,
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-500 dark:text-gray-400',
    borderColor: 'border-gray-200 dark:border-gray-700',
  },
}

/**
 * Fallback for a status the server returns that this map doesn't know yet.
 * Without it, an unmapped status makes `STATUS_CONFIG[status]` undefined and the
 * component throws on `config.icon`, taking the whole page down (this is exactly
 * what CHANGES_REQUESTED did). Degrade to a neutral badge labelled with the raw
 * status instead of crashing.
 */
const UNKNOWN_STATUS_CONFIG = {
  label: 'Unknown',
  icon: HelpCircle,
  bgColor: 'bg-gray-100 dark:bg-gray-800',
  textColor: 'text-gray-600 dark:text-gray-300',
  borderColor: 'border-gray-200 dark:border-gray-700',
} as const

const SIZE_CLASSES = {
  sm: { badge: 'px-1.5 py-0.5 text-xs', icon: 'w-3 h-3', gap: 'gap-1' },
  md: { badge: 'px-2 py-1 text-xs', icon: 'w-3.5 h-3.5', gap: 'gap-1.5' },
  lg: { badge: 'px-3 py-1.5 text-sm', icon: 'w-4 h-4', gap: 'gap-2' },
}

const PipelineStatusBadge: React.FC<PipelineStatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  showLabel = true,
  pulse = false,
}) => {
  const config = STATUS_CONFIG[status] ?? {
    ...UNKNOWN_STATUS_CONFIG,
    label: status ? String(status).replace(/_/g, ' ') : UNKNOWN_STATUS_CONFIG.label,
  }
  const sizeClass = SIZE_CLASSES[size]
  const Icon = config.icon

  const shouldAnimate = pulse || ('animate' in config && config.animate)

  return (
    <span
      className={`inline-flex items-center ${sizeClass.gap} ${sizeClass.badge} font-medium rounded-full border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
    >
      {showIcon && (
        <Icon
          className={`${sizeClass.icon} ${shouldAnimate ? 'animate-pulse' : ''}`}
        />
      )}
      {showLabel && config.label}
    </span>
  )
}

export default PipelineStatusBadge

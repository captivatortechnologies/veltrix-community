import React from 'react'
import {
  FileEdit,
  Search,
  XCircle,
  Clock,
  Rocket,
  Pause,
  CheckCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import type { ConfigCanvasStatus } from '../api/pipelineApi'

interface PipelineTimelineProps {
  currentStatus: ConfigCanvasStatus
  compact?: boolean
}

interface StageDefinition {
  key: ConfigCanvasStatus
  label: string
  icon: React.ElementType
}

const PIPELINE_STAGES: StageDefinition[] = [
  { key: 'DRAFT', label: 'Draft', icon: FileEdit },
  { key: 'VALIDATION_PENDING', label: 'Validate', icon: Search },
  // One "Approve" stage represents the whole approval gate: in-progress while
  // PENDING_APPROVAL, and complete (green) once APPROVED — separate "Approve"
  // and "Approved" steps read as duplicated.
  { key: 'PENDING_APPROVAL', label: 'Approve', icon: Clock },
  { key: 'DEPLOYING', label: 'Deploy', icon: Rocket },
  { key: 'DEPLOYED', label: 'Live', icon: CheckCheck },
]

// Status-to-stage mapping (for statuses that map to a pipeline stage)
const STATUS_STAGE_MAP: Record<ConfigCanvasStatus, number> = {
  DRAFT: 0,
  VALIDATION_PENDING: 1,
  VALIDATION_FAILED: 1,
  PENDING_APPROVAL: 2,
  // A reviewer sent it back — the pipeline is blocked at the approval stage.
  CHANGES_REQUESTED: 2,
  // Approved: the Approve stage is complete (rendered green via
  // `approveStageComplete`); the pipeline waits at the deploy gate.
  APPROVED: 2,
  DEPLOYMENT_QUEUED: 3,
  DEPLOYING: 3,
  DEPLOYMENT_PAUSED: 3,
  DEPLOYED: 4,
  DEPLOYMENT_FAILED: 3,
  ROLLED_BACK: 3,
  ARCHIVED: 4,
}

const ERROR_STATUSES: ConfigCanvasStatus[] = [
  'VALIDATION_FAILED',
  'DEPLOYMENT_FAILED',
  // Changes requested blocks the approval stage until the author resubmits.
  'CHANGES_REQUESTED',
]
const ACTIVE_STATUSES: ConfigCanvasStatus[] = ['VALIDATION_PENDING', 'DEPLOYING', 'DEPLOYMENT_QUEUED']

const PipelineTimeline: React.FC<PipelineTimelineProps> = ({
  currentStatus,
  compact = false,
}) => {
  const currentStageIndex = STATUS_STAGE_MAP[currentStatus]
  const isError = ERROR_STATUSES.includes(currentStatus)
  const isActive = ACTIVE_STATUSES.includes(currentStatus)
  // APPROVED completes the Approve stage (green ✓) without advancing into Deploy,
  // so no stage shows as in-progress until a deployment actually starts.
  const approveStageComplete = currentStatus === 'APPROVED'

  return (
    <div className="flex items-center w-full">
      {PIPELINE_STAGES.map((stage, index) => {
        const isCompleted =
          index < currentStageIndex || (approveStageComplete && index === currentStageIndex)
        const isCurrent = index === currentStageIndex && !approveStageComplete
        const isErrorStage = isCurrent && isError
        const isActiveStage = isCurrent && isActive

        const Icon = isErrorStage
          ? (currentStatus === 'VALIDATION_FAILED' ? XCircle : AlertTriangle)
          : isCurrent && currentStatus === 'ROLLED_BACK'
            ? RotateCcw
            : isCurrent && currentStatus === 'DEPLOYMENT_PAUSED'
              ? Pause
              : stage.icon

        const circleColor = isErrorStage
          ? 'bg-red-500 dark:bg-red-600'
          : isCompleted
            ? 'bg-emerald-500 dark:bg-emerald-600'
            : isCurrent
              ? 'bg-blue-500 dark:bg-blue-600'
              : 'bg-gray-200 dark:bg-gray-700'

        const iconColor = isCompleted || isCurrent || isErrorStage
          ? 'text-white'
          : 'text-gray-400 dark:text-gray-500'

        const lineColor = isCompleted
          ? 'bg-emerald-500 dark:bg-emerald-600'
          : 'bg-gray-200 dark:bg-gray-700'

        const labelColor = isErrorStage
          ? 'text-red-600 dark:text-red-400'
          : isCompleted
            ? 'text-emerald-600 dark:text-emerald-400'
            : isCurrent
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-400 dark:text-gray-500'

        return (
          <React.Fragment key={stage.key}>
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center rounded-full ${circleColor} ${
                  compact ? 'w-6 h-6' : 'w-8 h-8'
                } ${isActiveStage ? 'animate-pulse' : ''}`}
              >
                <Icon className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} ${iconColor}`} />
              </div>
              {!compact && (
                <span className={`mt-1.5 text-xs font-medium ${labelColor} whitespace-nowrap`}>
                  {isErrorStage
                    ? currentStatus === 'VALIDATION_FAILED' ? 'Failed' : 'Failed'
                    : isCurrent && currentStatus === 'DEPLOYMENT_PAUSED'
                      ? 'Paused'
                      : isCurrent && currentStatus === 'ROLLED_BACK'
                        ? 'Rolled Back'
                        : stage.label}
                </span>
              )}
            </div>
            {index < PIPELINE_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${lineColor}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default PipelineTimeline

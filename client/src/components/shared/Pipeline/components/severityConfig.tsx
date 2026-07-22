import type { ComponentType } from 'react'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'
import type { DriftSeverity } from '../api/pipelineApi'

export interface DriftSeverityStyle {
  icon: ComponentType<{ className?: string }>
  bgColor: string
  textColor: string
  borderColor: string
  label: string
}

/**
 * Shared icon/color/label per drift severity — the single source of truth for
 * DriftAlert (standalone Drift page) and the configuration details modal's
 * Drift tab, so both surfaces render severity identically.
 */
export const DRIFT_SEVERITY_CONFIG: Record<DriftSeverity, DriftSeverityStyle> = {
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

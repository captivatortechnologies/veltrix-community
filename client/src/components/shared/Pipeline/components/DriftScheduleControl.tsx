import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { pipelineApi, type DriftFrequency, type DriftScheduleResponse } from '../api/pipelineApi'
import { useToast } from '../../Toast'

const FREQ_LABELS: Record<DriftFrequency, string> = {
  off: 'Off',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
}
const INHERIT = '__inherit__'

interface DriftScheduleControlProps {
  /** App slug for a PER-APP override; omit for the TENANT default. */
  appId?: string
  /** Display name for the per-app label + toasts. */
  appName?: string
  className?: string
}

/**
 * Configure how often the scheduled drift sweep checks deployed configs. Without
 * an `appId` it edits the tenant default; with one it edits that app's override
 * (which wins over the tenant default, or "Inherit" to fall back to it).
 */
export default function DriftScheduleControl({ appId, appName, className }: DriftScheduleControlProps) {
  const toast = useToast()
  const [schedule, setSchedule] = useState<DriftScheduleResponse | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    pipelineApi
      .getDriftSchedule()
      .then((s) => {
        if (active) setSchedule(s)
      })
      .catch(() => {
        /* leave unset; the control just doesn't render */
      })
    return () => {
      active = false
    }
  }, [])

  if (!schedule) {
    return <p className={`text-sm text-gray-500 dark:text-gray-400 ${className ?? ''}`}>Loading drift schedule…</p>
  }

  const isPerApp = Boolean(appId)
  const current: string = isPerApp ? (schedule.perApp[appId!] ?? INHERIT) : schedule.tenantDefault

  const handleChange = async (value: string) => {
    setSaving(true)
    try {
      if (isPerApp && value === INHERIT) {
        await pipelineApi.clearDriftSchedule(appId!)
        const { [appId!]: _removed, ...rest } = schedule.perApp
        setSchedule({ ...schedule, perApp: rest })
        toast.success(`${appName ?? 'This app'} now inherits the tenant drift schedule.`)
      } else {
        const frequency = value as DriftFrequency
        await pipelineApi.setDriftSchedule(frequency, appId)
        setSchedule(
          isPerApp
            ? { ...schedule, perApp: { ...schedule.perApp, [appId!]: frequency } }
            : { ...schedule, tenantDefault: frequency },
        )
        toast.success('Drift check schedule updated.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update drift schedule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Clock className="h-4 w-4 text-gray-400" aria-hidden />
        Drift check schedule
        {isPerApp && <span className="text-gray-500 dark:text-gray-400">— {appName ?? appId}</span>}
      </label>
      <select
        value={current}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1.5 block w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        {isPerApp && <option value={INHERIT}>Inherit tenant default ({FREQ_LABELS[schedule.tenantDefault]})</option>}
        {schedule.options.map((f) => (
          <option key={f} value={f}>
            {FREQ_LABELS[f]}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        How often the scheduled sweep checks {isPerApp ? "this app's" : 'your'} deployed configurations for drift.{' '}
        {isPerApp
          ? 'Overrides the tenant default for this app.'
          : 'You can override this per app in each app’s settings. "Off" disables the scheduled check (you can still run it on demand).'}
      </p>
    </div>
  )
}

// ========================================================================
// useConfigDrift — fetches and manages Configuration Drift for ONE
// configuration canvas. Powers ConfigDetailsModal's Drift tab.
//
// "Correct" reuses the platform's existing deploy flow (appConfigResources'
// deployCanvas + pollDeployment — the same helpers AppConfigTypePage's Deploy
// button uses) to re-deploy the approved configuration over a manual change,
// then marks the drift record resolved. It only marks the record resolved
// once the re-deploy actually SUCCEEDED, so a failed correction attempt still
// shows the drift as unresolved.
// ========================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { pipelineApi, type DriftRecord } from '@/components/shared/Pipeline'
import { useToast } from '../../components/shared/Toast'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { deployCanvas, pollDeployment } from './appConfigResources'

export type ConfigDriftAction = 'correct' | 'acknowledge'

export interface UseConfigDriftResult {
  /** All drift records returned for this canvas (resolved + unresolved). */
  records: DriftRecord[]
  /** The subset still needing attention — what the Drift tab lists as action items. */
  unresolved: DriftRecord[]
  loading: boolean
  error: string | null
  /** True while an explicit "Check drift now" is in flight. */
  checking: boolean
  /** The record currently being corrected/acknowledged, if any. */
  busy: { id: string; action: ConfigDriftAction } | null
  refresh: () => Promise<void>
  checkNow: () => Promise<void>
  correct: (record: DriftRecord) => Promise<void>
  acknowledge: (record: DriftRecord) => Promise<void>
}

export function useConfigDrift(canvasId: string | undefined): UseConfigDriftResult {
  const toast = useToast()
  const { confirm } = useConfirmDialog()

  const [records, setRecords] = useState<DriftRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState<{ id: string; action: ConfigDriftAction } | null>(null)

  const refresh = useCallback(async () => {
    if (!canvasId) {
      setRecords([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const body = await pipelineApi.getCanvasDrift(canvasId)
      setRecords(body.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration drift')
    } finally {
      setLoading(false)
    }
  }, [canvasId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const checkNow = useCallback(async () => {
    if (!canvasId) return
    setChecking(true)
    setError(null)
    try {
      const result = await pipelineApi.checkCanvasDrift(canvasId)
      if (result.queued) {
        // Async check: poll the drift status until it goes back to IDLE (a managed
        // check hashes files over SSH + can run audit searches — it can take a
        // while). Cap the wait so the button never spins forever.
        const DEADLINE = Date.now() + 120_000
        let body = await pipelineApi.getCanvasDrift(canvasId)
        while (body.checkState === 'CHECKING' && Date.now() < DEADLINE) {
          await new Promise((r) => setTimeout(r, 2_000))
          body = await pipelineApi.getCanvasDrift(canvasId)
        }
        setRecords(body.data)
        if (body.checkState === 'CHECKING') {
          toast.info('Drift check is still running — results will appear shortly.')
        }
      } else {
        // Inline fallback (no job runner): data is already fresh.
        setRecords(result.data ?? [])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check for drift'
      setError(msg)
      toast.error(msg)
    } finally {
      setChecking(false)
    }
  }, [canvasId, toast])

  const acknowledge = useCallback(
    async (record: DriftRecord) => {
      setBusy({ id: record.id, action: 'acknowledge' })
      try {
        await pipelineApi.resolveDrift(record.id, 'acknowledged')
        toast.success('Drift acknowledged.')
        await refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to acknowledge drift')
      } finally {
        setBusy(null)
      }
    },
    [toast, refresh],
  )

  const correct = useCallback(
    async (record: DriftRecord) => {
      if (!canvasId) return
      const envName = record.environment?.name ?? 'this environment'
      const target = record.component?.hostname ?? 'the target'
      const confirmed = await confirm({
        title: 'Correct configuration drift',
        message: `Re-deploy the approved configuration to ${envName}? This overwrites the manual change detected on ${target}.`,
        confirmText: 'Re-deploy',
        cancelText: 'Cancel',
        variant: 'danger',
      })
      if (!confirmed) return

      setBusy({ id: record.id, action: 'correct' })
      try {
        const { deploymentId } = await deployCanvas(canvasId, record.environmentId)
        toast.info('Re-deploying approved configuration…')
        const status = await pollDeployment(deploymentId)
        if (status?.status === 'SUCCEEDED') {
          await pipelineApi.resolveDrift(record.id, 'redeployed')
          toast.success('Drift corrected — re-deployed approved configuration.')
          await refresh()
        } else {
          toast.error(
            status?.error ||
              'Re-deployment did not complete successfully; drift was not marked resolved.',
          )
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to correct drift')
      } finally {
        setBusy(null)
      }
    },
    [canvasId, confirm, toast, refresh],
  )

  const unresolved = useMemo(() => records.filter((r) => !r.isResolved), [records])

  return { records, unresolved, loading, error, checking, busy, refresh, checkNow, correct, acknowledge }
}

import React, { useEffect, useMemo, useState } from 'react'
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../../components/shared/Card'
import { Select, type SelectOption } from '../../../components/shared/Select'
import { Button } from '../../../components/shared/Button'
import { Badge } from '../../../components/shared/Badge'
import {
  sandboxApi,
  SandboxApiError,
  RUNNABLE_SANDBOX_HANDLERS,
  type SandboxManifestConfigType,
  type SandboxStatus,
  type RunnableSandboxHandler,
  type RunSandboxResponse,
} from '../../../services/sandboxApi'

export interface SandboxRunPanelProps {
  sandboxId: string
  sandboxStatus: SandboxStatus
  configTypes: SandboxManifestConfigType[]
}

const HANDLER_LABELS: Record<RunnableSandboxHandler, string> = {
  validate: 'validate',
  getStatus: 'getStatus',
  healthCheck: 'healthCheck',
  driftDetect: 'driftDetect',
}

const LOG_LEVEL_CLASSES: Record<string, string> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-info',
  log: 'text-content-inverse',
  debug: 'text-content-tertiary',
}

/** Why the sandbox can't run a handler right now, mirrored from run.service's assertRunnable(). */
const NOT_RUNNABLE_REASON: Partial<Record<SandboxStatus, string>> = {
  SYNCING: 'A sync is in progress. Handlers will be runnable again once it completes.',
  ERROR: 'The last sync failed validation. Fix the reported errors (see the manifest card above) and resync before running handlers.',
  EXPIRED: 'This sandbox has expired. Create a new one to continue.',
}

/** Turn a thrown error into a plain message + optional HTTP status for the banner. */
function describeRunError(error: unknown): { message: string; status: number | null } {
  if (error instanceof SandboxApiError) {
    return { message: error.message, status: error.status }
  }
  return { message: error instanceof Error ? error.message : 'Failed to run handler', status: null }
}

/** A sandbox-level failure (never synced/syncing, expired, runner concurrency) makes running
 * the remaining checks in a batch meaningless — these are the statuses that abort the batch
 * rather than just failing the one check. */
const BATCH_ABORTING_STATUSES = new Set([409, 410, 429])

interface PlannedCheck {
  configTypeId: string
  configTypeName: string
  handler: RunnableSandboxHandler
}

interface CheckRunState extends PlannedCheck {
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  result?: RunSandboxResponse
  error?: { message: string; status: number | null }
}

/**
 * Checks panel: a manifest-driven "Run all checks" batch (every runnable handler each
 * config type declares — validate/healthCheck/driftDetect/getStatus, whichever the type
 * actually lists; deploy/rollback are never offered) plus the original single-handler
 * manual run for ad-hoc testing. Config types/handlers are read entirely from the synced
 * manifest — nothing here is hardcoded to any particular app.
 */
export const SandboxRunPanel: React.FC<SandboxRunPanelProps> = ({
  sandboxId,
  sandboxStatus,
  configTypes,
}) => {
  const [configTypeId, setConfigTypeId] = useState('')
  const [handler, setHandler] = useState<RunnableSandboxHandler | ''>('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunSandboxResponse | null>(null)
  const [runError, setRunError] = useState<{ message: string; status: number | null } | null>(null)

  const [checks, setChecks] = useState<CheckRunState[] | null>(null)
  const [runningAll, setRunningAll] = useState(false)

  const configTypeOptions: SelectOption[] = useMemo(
    () => configTypes.map((ct) => ({ value: ct.id, label: `${ct.name} (${ct.id})` })),
    [configTypes],
  )

  const selectedConfigType = configTypes.find((ct) => ct.id === configTypeId)

  const runnableHandlerOptions: SelectOption[] = useMemo(() => {
    const declared = new Set(selectedConfigType?.handlers ?? [])
    return RUNNABLE_SANDBOX_HANDLERS.filter((h) => declared.has(h)).map((h) => ({
      value: h,
      label: HANDLER_LABELS[h],
    }))
  }, [selectedConfigType])

  // Every runnable handler each config type declares, derived purely from the manifest —
  // never a hardcoded list of config type ids/names/handlers.
  const plannedChecks: PlannedCheck[] = useMemo(() => {
    const list: PlannedCheck[] = []
    for (const ct of configTypes) {
      for (const h of RUNNABLE_SANDBOX_HANDLERS) {
        if (ct.handlers.includes(h)) {
          list.push({ configTypeId: ct.id, configTypeName: ct.name, handler: h })
        }
      }
    }
    return list
  }, [configTypes])

  // Default to the first configType/handler once the manifest loads, and re-derive the
  // handler selection whenever the configType changes so it never points at a handler
  // the newly-selected configType doesn't declare.
  useEffect(() => {
    if (!configTypeId && configTypeOptions.length > 0) {
      setConfigTypeId(configTypeOptions[0].value)
    }
  }, [configTypeId, configTypeOptions])

  useEffect(() => {
    if (runnableHandlerOptions.length === 0) {
      setHandler('')
      return
    }
    if (!runnableHandlerOptions.some((o) => o.value === handler)) {
      setHandler(runnableHandlerOptions[0].value as RunnableSandboxHandler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnableHandlerOptions])

  const notRunnableReason = NOT_RUNNABLE_REASON[sandboxStatus]
  const canRun = sandboxStatus === 'ACTIVE' && Boolean(configTypeId) && Boolean(handler) && !running && !runningAll
  const canRunAll = sandboxStatus === 'ACTIVE' && plannedChecks.length > 0 && !runningAll && !running

  const handleRun = async () => {
    if (!configTypeId || !handler) return
    setRunning(true)
    setRunError(null)
    try {
      const response = await sandboxApi.run(sandboxId, {
        configTypeId,
        handler: handler as RunnableSandboxHandler,
      })
      setResult(response)
    } catch (error) {
      setResult(null)
      setRunError(describeRunError(error))
    } finally {
      setRunning(false)
    }
  }

  const handleRunAll = async () => {
    if (plannedChecks.length === 0) return
    setRunningAll(true)
    setChecks(plannedChecks.map((check) => ({ ...check, status: 'pending' })))

    for (let i = 0; i < plannedChecks.length; i += 1) {
      setChecks((prev) => prev?.map((c, idx) => (idx === i ? { ...c, status: 'running' } : c)) ?? prev)
      try {
        // Sequential (not Promise.all): the runner caps concurrent runs per tenant, and
        // running checks one at a time gives honest incremental progress in the UI.
        const response = await sandboxApi.run(sandboxId, {
          configTypeId: plannedChecks[i].configTypeId,
          handler: plannedChecks[i].handler,
        })
        setChecks(
          (prev) =>
            prev?.map((c, idx) =>
              idx === i ? { ...c, status: response.ok ? 'success' : 'failed', result: response } : c,
            ) ?? prev,
        )
      } catch (error) {
        const described = describeRunError(error)
        const isBatchAborting = described.status !== null && BATCH_ABORTING_STATUSES.has(described.status)
        setChecks((prev) => {
          if (!prev) return prev
          const next = prev.map((c, idx) => (idx === i ? { ...c, status: 'failed' as const, error: described } : c))
          return isBatchAborting ? next.map((c, idx) => (idx > i ? { ...c, status: 'skipped' as const } : c)) : next
        })
        if (isBatchAborting) {
          setRunningAll(false)
          return
        }
      }
    }
    setRunningAll(false)
  }

  return (
    <Card variant="bordered">
      <CardHeader>
        <h2 className="text-base font-semibold text-content-primary flex items-center gap-2">
          <ListChecks size={18} className="text-primary" aria-hidden="true" />
          Checks
        </h2>
      </CardHeader>
      <CardBody>
        {configTypes.length === 0 ? (
          <p className="text-sm text-content-tertiary">
            Sync a valid app before running handlers — see the manifest card above.
          </p>
        ) : (
          <div className="space-y-6">
            {notRunnableReason && (
              <div
                className="rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground flex items-start gap-2"
                role="status"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {notRunnableReason}
              </div>
            )}

            {/* Run all checks — every runnable handler each manifest config type declares. */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-medium text-content-primary">Run all checks</h3>
                  <p className="text-xs text-content-tertiary">
                    Runs validate, healthCheck, driftDetect and getStatus for every configuration type
                    that declares them — deploy and rollback are never run here.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunAll}
                  disabled={!canRunAll}
                  isLoading={runningAll}
                  leftIcon={<ListChecks size={16} aria-hidden="true" />}
                >
                  Run all checks
                </Button>
              </div>

              {plannedChecks.length === 0 ? (
                <p className="text-sm text-content-tertiary">
                  No configuration type declares a runnable handler (validate, healthCheck, driftDetect or
                  getStatus) — nothing to check.
                </p>
              ) : (
                checks && (
                  <ul className="space-y-2" aria-label="Check results">
                    {checks.map((check, i) => (
                      <li key={`${check.configTypeId}-${check.handler}-${i}`}>
                        <CheckResultRow check={check} />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </section>

            {/* Manual single-handler run — unchanged advanced/ad-hoc mode. */}
            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="text-sm font-medium text-content-primary">Run a single handler</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Configuration type"
                  options={configTypeOptions}
                  value={configTypeId}
                  onChange={setConfigTypeId}
                  aria-label="Configuration type"
                />
                <Select
                  label="Handler"
                  options={runnableHandlerOptions}
                  value={handler}
                  onChange={(v) => setHandler(v as RunnableSandboxHandler)}
                  disabled={runnableHandlerOptions.length === 0}
                  placeholder={runnableHandlerOptions.length === 0 ? 'No runnable handlers' : 'Select…'}
                  aria-label="Handler"
                />
              </div>

              <p className="text-xs text-content-tertiary">
                Only validate, getStatus, healthCheck and driftDetect can run in a sandbox — deploy and
                rollback mutate external systems and are never exposed here. Runs execute against an
                empty draft canvas (no field values entered), in an isolated child process with a
                scrubbed environment and a 30s hard timeout.
              </p>

              <Button
                variant="secondary"
                onClick={handleRun}
                disabled={!canRun}
                isLoading={running}
                leftIcon={<Play size={16} aria-hidden="true" />}
              >
                Run handler
              </Button>

              {runError && (
                <div
                  className="rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground flex items-start gap-2"
                  role="alert"
                >
                  <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {runError.status && (
                      <span className="font-mono text-xs mr-1.5 opacity-75">[{runError.status}]</span>
                    )}
                    {runError.message}
                  </span>
                </div>
              )}

              {result && <RunResult result={result} />}
            </section>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

const STATUS_ICON: Record<CheckRunState['status'], React.ReactNode> = {
  pending: <Clock size={14} className="text-content-tertiary" aria-hidden="true" />,
  running: <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />,
  success: <CheckCircle2 size={14} className="text-success" aria-hidden="true" />,
  failed: <XCircle size={14} className="text-danger" aria-hidden="true" />,
  skipped: <AlertTriangle size={14} className="text-content-tertiary" aria-hidden="true" />,
}

const STATUS_LABEL: Record<CheckRunState['status'], string> = {
  pending: 'Pending',
  running: 'Running…',
  success: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
}

/** One row of a "Run all checks" batch — collapsed by default, expandable to the same
 * result/log detail the manual run panel shows. */
const CheckResultRow: React.FC<{ check: CheckRunState }> = ({ check }) => {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = Boolean(check.result)

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2 min-w-0">
          {STATUS_ICON[check.status]}
          <span className="font-medium text-content-primary truncate">{check.configTypeName}</span>
          <span className="text-xs font-mono text-content-tertiary">{check.handler}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0 text-xs text-content-tertiary">
          <span>{STATUS_LABEL[check.status]}</span>
          {check.result?.timedOut && (
            <Badge variant="warning" size="sm">
              Timed out
            </Badge>
          )}
          {check.result && <span>{check.result.durationMs}ms</span>}
          {hasDetails &&
            (expanded ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            ))}
        </span>
      </button>

      {check.error && (
        <p className="px-3 pb-2 text-xs text-danger flex items-start gap-1.5">
          {check.error.status !== null && (
            <span className="font-mono opacity-75">[{check.error.status}]</span>
          )}
          {check.error.message}
        </p>
      )}

      {expanded && check.result && (
        <div className="border-t border-border px-3 py-2">
          <RunResult result={check.result} showSummary={false} />
        </div>
      )}
    </div>
  )
}

const RunResult: React.FC<{ result: RunSandboxResponse; showSummary?: boolean }> = ({
  result,
  showSummary = true,
}) => (
  <div className="space-y-3" role="status" aria-label="Run result">
    {showSummary && (
      <div className="flex flex-wrap items-center gap-2">
        {result.ok ? (
          <Badge variant="success" size="sm">
            <CheckCircle2 size={12} className="mr-1" aria-hidden="true" />
            Completed
          </Badge>
        ) : (
          <Badge variant="danger" size="sm">
            <XCircle size={12} className="mr-1" aria-hidden="true" />
            Failed
          </Badge>
        )}
        {result.timedOut && (
          <Badge variant="warning" size="sm">
            Timed out
          </Badge>
        )}
        <span className="text-xs text-content-tertiary flex items-center gap-1">
          <Clock size={12} aria-hidden="true" />
          {result.durationMs}ms
        </span>
        <span className="text-xs text-content-tertiary font-mono">
          {result.configTypeId} / {result.handler}
        </span>
      </div>
    )}

    {result.error && (
      <p className="text-sm text-danger bg-danger-subtle rounded-md px-3 py-2">{result.error}</p>
    )}

    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-content-tertiary mb-1">Result</h3>
      <pre className="bg-surface-sunken border border-border rounded-md px-3 py-2 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
        {JSON.stringify(result.result, null, 2) ?? 'null'}
      </pre>
    </div>

    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-content-tertiary mb-1">
        Logs ({result.logs.length})
      </h3>
      {result.logs.length === 0 ? (
        <p className="text-xs text-content-tertiary">No console output was captured for this run.</p>
      ) : (
        // Theme-stable terminal look — see SandboxesPage.tsx for why bg-content-primary
        // isn't used here (it resolves near-white in dark mode; text-content-inverse
        // above is already a constant white, so this pairs correctly in both themes).
        <div className="bg-gray-900 rounded-md px-3 py-2 font-mono text-xs max-h-64 overflow-y-auto">
          {result.logs.map((entry, i) => (
            <div key={i} className={LOG_LEVEL_CLASSES[entry.level] ?? 'text-content-inverse'}>
              <span className="opacity-60 mr-1.5">[{entry.level}]</span>
              {entry.line}
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)

export default SandboxRunPanel

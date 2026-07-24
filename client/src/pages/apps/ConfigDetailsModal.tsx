import React, { useEffect, useState } from 'react'
import { CheckCircle2, Edit2, Copy, Rocket, RotateCcw, Trash2, GitPullRequest, Send, Loader2, Ticket, Check, Eye, EyeOff } from 'lucide-react'
import { Modal } from '@/components/shared/Modal/Modal'
import { Tabs, type TabItem } from '@/components/shared/Tabs'
import {
  configurationCanvasApi,
  type ConfigurationCanvas,
  type ConfigurationCanvasListItem,
} from '@/components/shared/ConfigurationCanvas/api/configurationCanvasApi'
import {
  getLatestDeployedResources,
  type DeployedResource,
  type DeployedResourceField,
} from './appConfigResources'
import { TicketLinkPanel } from '@/components/apps/TicketLinkPanel'
import { ConfigDriftPanel } from '@/components/apps/ConfigDriftPanel'
import { useConfigDrift } from './useConfigDrift'

/** Render any field value as a readable string for the details view. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(', ') : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/** Copy-to-clipboard button with transient "copied" feedback. */
const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      title={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
      aria-label={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/** One deployed-resource field: value (masked for secrets) + reveal + copy. */
const ResourceFieldRow: React.FC<{ field: DeployedResourceField }> = ({ field }) => {
  const [revealed, setRevealed] = useState(false)
  const isSecret = Boolean(field.secret)
  const shown = isSecret && !revealed ? '•'.repeat(Math.min(field.value.length || 12, 24)) : field.value
  return (
    <div className="grid grid-cols-3 gap-3 px-4 py-2">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{field.label}</dt>
      <dd className="col-span-2 flex items-center gap-2">
        <span
          className={`break-all text-sm ${isSecret ? 'font-mono' : ''} text-gray-900 dark:text-white`}
        >
          {shown}
        </span>
        {isSecret && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? 'Hide' : 'Reveal'}
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        {field.copyable && <CopyButton value={field.value} label={field.label} />}
      </dd>
    </div>
  )
}

/** "Deployed resources" section — the deploy output (e.g. created HEC tokens). */
const DeployedResourcesSection: React.FC<{ canvasId: string }> = ({ canvasId }) => {
  const [resources, setResources] = useState<DeployedResource[]>([])
  useEffect(() => {
    let cancelled = false
    getLatestDeployedResources(canvasId)
      .then((r) => {
        if (!cancelled) setResources(r)
      })
      .catch(() => {
        /* no deployment / no resources — section stays hidden */
      })
    return () => {
      cancelled = true
    }
  }, [canvasId])

  if (resources.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
        Deployed resources
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {resources.map((r, i) => (
          <div key={`${r.name}-${i}`}>
            <div className="px-4 pt-3 pb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              {r.name}
            </div>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              {r.fields.map((f, j) => (
                <ResourceFieldRow key={`${f.label}-${j}`} field={f} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ConfigDetailsModalProps {
  config: ConfigurationCanvasListItem | null
  onClose: () => void
  onValidate?: (c: ConfigurationCanvasListItem) => void
  onEdit?: (c: ConfigurationCanvasListItem) => void
  onDuplicate?: (c: ConfigurationCanvasListItem) => void
  onDeploy?: (c: ConfigurationCanvasListItem) => void
  /** Roll a deployed configuration back to its previous state (shown for deployed configs). */
  onRollback?: (c: ConfigurationCanvasListItem) => void
  onDelete?: (c: ConfigurationCanvasListItem) => void
  onReviews?: (c: ConfigurationCanvasListItem) => void
  onSubmitApproval?: (c: ConfigurationCanvasListItem) => void
  /** Renders a "Change / Issue tickets" section (TicketLinkPanel) and a footer button. */
  onLinkTicket?: (c: ConfigurationCanvasListItem) => void
  deployBlockedReason?: (c: ConfigurationCanvasListItem) => string | null
}

const BTN =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed'
const GHOST =
  'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'

/**
 * Read-only details view for a configuration, opened from a config list row.
 * Shows the full section/field breakdown and mirrors the row's action buttons
 * in the footer (each closes the modal and delegates to the page's handler).
 * Generic — used by any app config list page.
 */
export const ConfigDetailsModal: React.FC<ConfigDetailsModalProps> = ({
  config,
  onClose,
  onValidate,
  onEdit,
  onDuplicate,
  onDeploy,
  onRollback,
  onDelete,
  onReviews,
  onSubmitApproval,
  onLinkTicket,
  deployBlockedReason,
}) => {
  const [detail, setDetail] = useState<ConfigurationCanvas | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Configuration Drift for this canvas — fetched independently of the section
  // detail above so the Drift tab has its own loading/error state.
  const drift = useConfigDrift(config?.id)

  useEffect(() => {
    if (!config) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    configurationCanvasApi
      .getById(config.id)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load configuration')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [config])

  if (!config) return null

  const blocked = deployBlockedReason?.(config) ?? null
  // Each action closes the modal, then runs the page's handler with the config.
  const act = (fn?: (c: ConfigurationCanvasListItem) => void) => () => {
    onClose()
    fn?.(config)
  }

  const driftTabLabel = drift.unresolved.length > 0 ? `Drift (${drift.unresolved.length})` : 'Drift'

  const tabs: TabItem[] = [
    {
      key: 'details',
      label: 'Details',
      content: loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2">Loading…</span>
        </div>
      ) : error ? (
        <div className="py-6 text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : detail ? (
        <div className="space-y-5">
          {config.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{config.description}</p>
          )}
          {(detail.sections ?? []).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">This configuration has no sections.</p>
          ) : (
            (detail.sections ?? []).map((section) => (
              <div
                key={section.id ?? section.name}
                className="rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  {section.name}
                </div>
                <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(section.fields ?? []).map((f) => (
                    <div key={f.key} className="grid grid-cols-3 gap-3 px-4 py-2">
                      <dt className="text-sm text-gray-500 dark:text-gray-400">{f.label || f.key}</dt>
                      <dd className="col-span-2 break-words text-sm text-gray-900 dark:text-white">
                        {formatValue(f.value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          )}

          <DeployedResourcesSection canvasId={config.id} />

          {onLinkTicket && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                Change / Issue tickets
              </div>
              <div className="p-4">
                <TicketLinkPanel
                  canvasId={config.id}
                  defaultSummary={`Change: ${config.name}`}
                  defaultDescription={
                    `Change request for Veltrix configuration "${config.name}".\n\n` +
                    `Status: ${config.status} (v${config.version})\n` +
                    (config.description ? `Description: ${config.description}\n` : '') +
                    `\nTracked in Veltrix for change & issue management.`
                  }
                />
              </div>
            </div>
          )}
        </div>
      ) : null,
    },
    {
      key: 'drift',
      label: driftTabLabel,
      content: (
        <ConfigDriftPanel
          records={drift.records}
          unresolved={drift.unresolved}
          loading={drift.loading}
          error={drift.error}
          checking={drift.checking}
          busy={drift.busy}
          onCheckNow={drift.checkNow}
          onCorrect={drift.correct}
          onAcknowledge={drift.acknowledge}
        />
      ),
    },
  ]

  return (
    <Modal
      isOpen={config !== null}
      onClose={onClose}
      title={config.name}
      subtitle={
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Status: {config.status} · v{config.version} · Updated{' '}
          {new Date(config.updatedAt).toLocaleString()}
        </span>
      }
      size="lg"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {onValidate && (
            <button onClick={act(onValidate)} className={`${BTN} ${GHOST}`}>
              <CheckCircle2 className="h-4 w-4" /> Validate
            </button>
          )}
          {onEdit && (
            <button onClick={act(onEdit)} className={`${BTN} ${GHOST}`}>
              <Edit2 className="h-4 w-4" /> Edit
            </button>
          )}
          {onDuplicate && (
            <button onClick={act(onDuplicate)} className={`${BTN} ${GHOST}`}>
              <Copy className="h-4 w-4" /> Duplicate
            </button>
          )}
          {onReviews && (
            <button onClick={act(onReviews)} className={`${BTN} ${GHOST}`}>
              <GitPullRequest className="h-4 w-4" /> Reviews
            </button>
          )}
          {onLinkTicket && (
            <button onClick={act(onLinkTicket)} className={`${BTN} ${GHOST}`}>
              <Ticket className="h-4 w-4" /> Tickets
            </button>
          )}
          {onSubmitApproval && config.status === 'DRAFT' && (
            <button
              onClick={act(onSubmitApproval)}
              className={`${BTN} border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300`}
            >
              <Send className="h-4 w-4" /> Submit for approval
            </button>
          )}
          {onDeploy && (
            <button
              onClick={act(onDeploy)}
              disabled={!!blocked}
              title={blocked ?? 'Deploy'}
              className={`${BTN} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
              <Rocket className="h-4 w-4" /> Deploy
            </button>
          )}
          {onRollback && ['DEPLOYED', 'DEPLOYMENT_FAILED'].includes(config.status) && (
            <button
              onClick={act(onRollback)}
              title="Roll back to the previous deployed configuration"
              className={`${BTN} border border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900/20`}
            >
              <RotateCcw className="h-4 w-4" /> Roll back
            </button>
          )}
          {onDelete && (
            <button
              onClick={act(onDelete)}
              disabled={config.status !== 'DRAFT'}
              title={config.status === 'DRAFT' ? 'Delete' : 'Only drafts can be deleted'}
              className={`${BTN} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300`}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      }
    >
      {config.status === 'DEPLOYMENT_FAILED' &&
        (detail?.lastDeployError ?? config.lastDeployError) && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Last deployment failed
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-600 dark:text-red-400">
              {detail?.lastDeployError ?? config.lastDeployError}
            </p>
          </div>
        )}
      <Tabs tabs={tabs} />
    </Modal>
  )
}

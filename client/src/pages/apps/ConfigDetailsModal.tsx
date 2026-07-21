import React, { useEffect, useState } from 'react'
import { CheckCircle2, Edit2, Copy, Rocket, Trash2, GitPullRequest, Send, Loader2, Ticket } from 'lucide-react'
import { Modal } from '@/components/shared/Modal/Modal'
import {
  configurationCanvasApi,
  type ConfigurationCanvas,
  type ConfigurationCanvasListItem,
} from '@/components/shared/ConfigurationCanvas/api/configurationCanvasApi'
import { TicketLinkPanel } from '@/components/apps/TicketLinkPanel'

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

export interface ConfigDetailsModalProps {
  config: ConfigurationCanvasListItem | null
  onClose: () => void
  onValidate?: (c: ConfigurationCanvasListItem) => void
  onEdit?: (c: ConfigurationCanvasListItem) => void
  onDuplicate?: (c: ConfigurationCanvasListItem) => void
  onDeploy?: (c: ConfigurationCanvasListItem) => void
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
  onDelete,
  onReviews,
  onSubmitApproval,
  onLinkTicket,
  deployBlockedReason,
}) => {
  const [detail, setDetail] = useState<ConfigurationCanvas | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
              className={`${BTN} border border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300`}
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
      {loading ? (
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
      ) : null}
    </Modal>
  )
}

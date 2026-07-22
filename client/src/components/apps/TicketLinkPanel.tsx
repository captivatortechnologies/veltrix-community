import React, { useCallback, useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Ticket as TicketIcon, Plus, ExternalLink, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Badge, type BadgeVariant } from '@/components/shared/Badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormDialog } from '@/components/shared/FormDialog'
import { Input } from '@/components/shared/Input'
import { Select } from '@/components/shared/Select'
import { Textarea } from '@/components/shared/Textarea'
import { Alert } from '@/components/shared/Alert'
import { useToast } from '@/components/shared/Toast'
import { useConfirmDialog } from '@/components/shared/ConfirmationDialog'
import { ticketLinkApi } from '@/services/ticketLinkApi'
import type { ConfigurationTicketLinkDTO } from '@/services/ticketLinkApi'
import { ticketingProviderApi } from '@/services/ticketingProviderApi'
import type { TicketingConnection } from '@/services/ticketingProviderApi'
import type { TicketType, TicketLinkType } from '../../../../shared/types/ticketing'

export interface TicketLinkPanelProps {
  /** The configuration canvas this panel manages ticket links for. */
  canvasId: string
  /** Pre-fills the "Create new" ticket Summary from the linked configuration. */
  defaultSummary?: string
  /** Pre-fills the "Create new" ticket Description from the linked configuration. */
  defaultDescription?: string
}

type DialogMode = 'create' | 'existing'

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: 'change', label: 'Change' },
  { value: 'incident', label: 'Incident' },
  { value: 'problem', label: 'Problem' },
  { value: 'task', label: 'Task' },
]

const LINK_TYPE_OPTIONS: { value: TicketLinkType; label: string }[] = [
  { value: 'change', label: 'Change' },
  { value: 'issue', label: 'Issue' },
]

const PROVIDER_LABEL: Record<string, string> = {
  servicenow: 'ServiceNow',
  zendesk: 'Zendesk',
}

/** Best-effort status -> badge tone. Provider status strings aren't normalized
 * (ServiceNow numeric `state`, Zendesk `open`/`solved`/...), so this matches on
 * common substrings rather than an exact enum. */
function statusVariant(status: string | null): BadgeVariant {
  if (!status) return 'secondary'
  const s = status.toLowerCase()
  if (['closed', 'solved', 'resolved', 'complete', 'implement'].some((k) => s.includes(k))) return 'success'
  if (['cancel', 'reject', 'fail'].some((k) => s.includes(k))) return 'danger'
  if (['hold', 'pending'].some((k) => s.includes(k))) return 'warning'
  return 'info'
}

/** A ticket already in a terminal state — the "Close ticket" action is hidden. */
function isTerminalStatus(status: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return ['closed', 'solved', 'resolved', 'complete', 'cancel'].some((k) => s.includes(k))
}

/**
 * Lists a configuration canvas's linked change/issue tickets, and lets the
 * user create a new ticket (in a configured provider connection) or link an
 * existing one by id/number. Embedded in ConfigDetailsModal's "Change / Issue
 * tickets" section — canvasId-scoped so it can be reused anywhere a canvas is
 * shown.
 */
export const TicketLinkPanel: React.FC<TicketLinkPanelProps> = ({
  canvasId,
  defaultSummary = '',
  defaultDescription = '',
}) => {
  const toast = useToast()
  const { confirm } = useConfirmDialog()

  const [links, setLinks] = useState<ConfigurationTicketLinkDTO[]>([])
  const [connections, setConnections] = useState<TicketingConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [mode, setMode] = useState<DialogMode>('existing')
  const [connectionId, setConnectionId] = useState('')
  const [summary, setSummary] = useState(defaultSummary)
  const [description, setDescription] = useState(defaultDescription)
  const [ticketType, setTicketType] = useState<TicketType>('change')
  const [linkType, setLinkType] = useState<TicketLinkType>('change')
  const [externalRef, setExternalRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [linkData, connectionData] = await Promise.all([
        ticketLinkApi.list(canvasId),
        ticketingProviderApi.list().catch(() => []),
      ])
      setLinks(linkData)
      setConnections(connectionData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket links')
    } finally {
      setLoading(false)
    }
  }, [canvasId])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = useCallback(() => {
    setMode('existing')
    setConnectionId('')
    setSummary(defaultSummary)
    setDescription(defaultDescription)
    setTicketType('change')
    setLinkType('change')
    setExternalRef('')
    setSubmitError(null)
  }, [defaultSummary, defaultDescription])

  const openDialog = useCallback(() => {
    resetForm()
    setDialogOpen(true)
  }, [resetForm])

  const closeDialog = useCallback(() => {
    if (submitting) return
    setDialogOpen(false)
  }, [submitting])

  const handleSubmit = useCallback(async () => {
    setSubmitError(null)
    setSubmitting(true)
    try {
      if (mode === 'create') {
        await ticketLinkApi.createTicket(canvasId, {
          connectionId: connectionId || undefined,
          summary: summary.trim(),
          description: description.trim() || undefined,
          ticketType,
          linkType,
        })
        toast.success('Ticket created and linked.')
      } else {
        await ticketLinkApi.linkExisting(canvasId, {
          connectionId: connectionId || undefined,
          externalRef: externalRef.trim(),
          linkType,
        })
        toast.success('Ticket linked.')
      }
      setDialogOpen(false)
      await load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to link ticket')
    } finally {
      setSubmitting(false)
    }
  }, [mode, canvasId, connectionId, summary, description, ticketType, linkType, externalRef, toast, load])

  const handleClose = useCallback(
    async (link: ConfigurationTicketLinkDTO) => {
      const ref = link.externalKey || link.externalId
      const confirmed = await confirm({
        title: 'Close ticket',
        message: `Close ${ref} in ${PROVIDER_LABEL[link.provider] ?? link.provider}? This resolves the ticket in your ticketing system.`,
        confirmText: 'Close ticket',
        cancelText: 'Cancel',
        variant: 'info',
      })
      if (!confirmed) return
      setClosingId(link.id)
      try {
        await ticketLinkApi.close(link.id)
        toast.success('Ticket closed.')
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to close ticket')
      } finally {
        setClosingId(null)
      }
    },
    [confirm, toast, load],
  )

  const handleUnlink = useCallback(
    async (link: ConfigurationTicketLinkDTO) => {
      const confirmed = await confirm({
        title: 'Remove ticket link',
        message: `Remove the link to ${link.externalKey || link.externalId}? The ticket itself is not affected.`,
        confirmText: 'Remove',
        cancelText: 'Cancel',
        variant: 'danger',
      })
      if (!confirmed) return
      setUnlinkingId(link.id)
      try {
        await ticketLinkApi.unlink(link.id)
        toast.success('Ticket link removed.')
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to remove ticket link')
      } finally {
        setUnlinkingId(null)
      }
    },
    [confirm, toast, load],
  )

  const submitDisabled =
    connections.length === 0 ||
    (mode === 'create' ? summary.trim() === '' : externalRef.trim() === '')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Link this configuration to a change or incident ticket for change &amp; issue management.
        </p>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openDialog}>
          Link ticket
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center py-6" role="status" aria-label="Loading ticket links">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        </div>
      ) : links.length === 0 ? (
        <EmptyState
          icon={<TicketIcon className="h-10 w-10" />}
          title="No tickets linked"
          description="Create a new ticket or link an existing one to track this configuration as a change or issue."
          action={
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openDialog}>
              Link ticket
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {links.map((link) => (
            <li key={link.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" size="sm">
                    {PROVIDER_LABEL[link.provider] ?? link.provider}
                  </Badge>
                  <Badge size="sm">{link.linkType === 'issue' ? 'Issue' : 'Change'}</Badge>
                  {link.status && (
                    <Badge variant={statusVariant(link.status)} size="sm">
                      {link.status}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {link.externalKey || link.externalId}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    link.externalKey || link.externalId
                  )}
                </div>
                {link.title && (
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400">{link.title}</p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {!isTerminalStatus(link.status) && (
                  <button
                    onClick={() => void handleClose(link)}
                    disabled={closingId === link.id || unlinkingId === link.id}
                    title="Close ticket"
                    aria-label={`Close ticket ${link.externalKey || link.externalId}`}
                    className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-50 dark:text-gray-500 dark:hover:bg-green-900/20 dark:hover:text-green-400"
                  >
                    {closingId === link.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => void handleUnlink(link)}
                  disabled={unlinkingId === link.id || closingId === link.id}
                  title="Remove link"
                  aria-label={`Remove link to ${link.externalKey || link.externalId}`}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  {unlinkingId === link.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormDialog
        isOpen={dialogOpen}
        onClose={closeDialog}
        title="Link a ticket"
        description="Create a new ticket in your ticketing system, or link one that already exists."
        onSubmit={handleSubmit}
        submitText={mode === 'create' ? 'Create ticket' : 'Link ticket'}
        isSubmitting={submitting}
        error={submitError}
        submitDisabled={submitDisabled}
      >
        <div className="flex gap-2" role="group" aria-label="Ticket link mode">
          <Button
            type="button"
            size="sm"
            variant={mode === 'create' ? 'primary' : 'secondary'}
            onClick={() => setMode('create')}
          >
            Create new
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'existing' ? 'primary' : 'secondary'}
            onClick={() => setMode('existing')}
          >
            Link existing
          </Button>
        </div>

        {connections.length === 0 ? (
          <Alert variant="warning" title="No ticketing connection configured">
            Set one up in{' '}
            <RouterLink to="/settings/ticketing" className="font-medium underline">
              Settings &rarr; Ticketing
            </RouterLink>{' '}
            before linking a ticket.
          </Alert>
        ) : (
          <Select
            label="Ticketing connection"
            value={connectionId}
            onChange={setConnectionId}
            placeholder="Use the tenant default"
            options={connections.map((c) => ({
              value: c.id,
              label: `${c.name} (${PROVIDER_LABEL[c.provider] ?? c.provider})`,
            }))}
          />
        )}

        {mode === 'create' ? (
          <>
            <Input
              label="Summary"
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short summary of the change"
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional detail (optional)"
              rows={3}
            />
            <Select
              label="Ticket type"
              value={ticketType}
              onChange={(v) => setTicketType(v as TicketType)}
              options={TICKET_TYPE_OPTIONS}
            />
          </>
        ) : (
          <Input
            label="Ticket ID or number"
            required
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder="e.g. CHG0030001 or #4521"
            helperText="The ServiceNow sys_id/number or Zendesk ticket ID."
          />
        )}

        <Select
          label="Link type"
          value={linkType}
          onChange={(v) => setLinkType(v as TicketLinkType)}
          options={LINK_TYPE_OPTIONS}
        />
      </FormDialog>
    </div>
  )
}

export default TicketLinkPanel

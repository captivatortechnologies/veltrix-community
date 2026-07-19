// ========================================================================
// ReviewsDrawer — a GitHub-PR-style review surface for a single configuration
// canvas, shown as a right-hand slide-over from the generic AppConfigTypePage.
//
// It composes four reused pieces plus the new threaded comments:
//   1. <VersionControlPanel> (commit timeline + diff + restore) — driven by the
//      central /api/configuration-history feed. showApprovals is FALSE because
//      its built-in approve/reject hit the WRONG (central-log) system; real
//      approvals are driven here via configurationCanvasApi.
//   2. Reviewers panel from getApprovals() — per-reviewer rows + "Approved N/M"
//      + the submission comment as the PR description.
//   3. Reviewer controls — Approve / Request changes for a PENDING assignee, and
//      Re-request review (ApprovalSubmissionDialog) once changes were requested.
//   4. <CommentThread> — threaded comments, optionally anchored to a version.
// ========================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { X, GitPullRequest, CheckCircle2, MessageSquareWarning, Loader2, RefreshCw } from 'lucide-react'
import {
  configurationCanvasApi,
  ApprovalSubmissionDialog,
} from '@/components/shared/ConfigurationCanvas'
import type {
  ConfigurationCanvasListItem,
  ApprovalStatus,
  ApprovalEntry,
  ConfigurationCanvasHistoryEntry,
  ApprovalSubmissionData,
} from '@/components/shared/ConfigurationCanvas'
import { VersionControlPanel } from '@/components/shared/VersionControl'
import type { VersionEntry } from '@/components/shared/VersionControl'
import { Button } from '@/components/shared/Button'
import { Badge, type BadgeVariant } from '@/components/shared/Badge'
import { Textarea } from '@/components/shared/Textarea'
import { FormDialog } from '@/components/shared/FormDialog'
import { useToast } from '@/components/shared/Toast'
import { CommentThread } from './CommentThread'

export interface ReviewsDrawerProps {
  config: ConfigurationCanvasListItem
  /** Signed-in user id (from getUser()) — decides which reviewer controls show. */
  currentUserId?: string
  /** Reused by ApprovalSubmissionDialog to re-request review. */
  fetchUsers: () => Promise<Array<{ id: string; name: string; email: string; role?: string }>>
  fetchTags: () => Promise<Array<{ id: string; name: string; color?: string }>>
  onClose: () => void
  /** Called after any state change (approve/reject/re-request/restore) so the list refreshes. */
  onChanged: () => void
}

const REVIEWER_STATUS_VARIANT: Record<ApprovalEntry['status'], BadgeVariant> = {
  APPROVED: 'success',
  REJECTED: 'danger',
  PENDING: 'warning',
}

const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  title,
  children,
  right,
}) => (
  <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      {right}
    </div>
    {children}
  </section>
)

export const ReviewsDrawer: React.FC<ReviewsDrawerProps> = ({
  config,
  currentUserId,
  fetchUsers,
  fetchTags,
  onClose,
  onChanged,
}) => {
  const toast = useToast()

  const [approvals, setApprovals] = useState<ApprovalStatus | null>(null)
  const [loadingApprovals, setLoadingApprovals] = useState(true)
  const [history, setHistory] = useState<ConfigurationCanvasHistoryEntry[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('') // '' = all versions
  const [actionBusy, setActionBusy] = useState<'approve' | 'reject' | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [reRequestOpen, setReRequestOpen] = useState(false)

  const loadApprovals = useCallback(async () => {
    setLoadingApprovals(true)
    try {
      const data = await configurationCanvasApi.getApprovals(config.id)
      setApprovals(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load reviewers')
    } finally {
      setLoadingApprovals(false)
    }
  }, [config.id, toast])

  const loadHistory = useCallback(async () => {
    try {
      const data = await configurationCanvasApi.getHistory(config.id)
      setHistory(data)
    } catch {
      setHistory([])
    }
  }, [config.id])

  useEffect(() => {
    void loadApprovals()
    void loadHistory()
  }, [loadApprovals, loadHistory])

  const canvasStatus = approvals?.canvasStatus ?? config.status
  const myApproval = useMemo(
    () => approvals?.approvals.find((a) => a.approver.id === currentUserId),
    [approvals, currentUserId],
  )
  const isAssignedReviewer = Boolean(myApproval)
  const canAct = canvasStatus === 'PENDING_APPROVAL' && myApproval?.status === 'PENDING'
  const submissionComment = approvals?.approvals.find((a) => a.submissionComment)?.submissionComment

  const handleApprove = useCallback(async () => {
    setActionBusy('approve')
    try {
      await configurationCanvasApi.approveCanvas(config.id)
      toast.success('Approved.')
      await loadApprovals()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setActionBusy(null)
    }
  }, [config.id, toast, loadApprovals, onChanged])

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) return
    setActionBusy('reject')
    try {
      await configurationCanvasApi.rejectCanvas(config.id, rejectReason.trim())
      toast.success('Changes requested.')
      setRejectOpen(false)
      setRejectReason('')
      await loadApprovals()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request changes')
    } finally {
      setActionBusy(null)
    }
  }, [config.id, rejectReason, toast, loadApprovals, onChanged])

  const handleReRequest = useCallback(
    async (data: ApprovalSubmissionData) => {
      await configurationCanvasApi.submitForApproval(
        config.id,
        data.approverIds,
        data.environmentIds || [],
        data.comment,
      )
      toast.success('Review re-requested.')
      setReRequestOpen(false)
      await loadApprovals()
      onChanged()
    },
    [config.id, toast, loadApprovals, onChanged],
  )

  const handleRevert = useCallback(
    async (entry: VersionEntry) => {
      const canvasHistoryId = (entry.details as { canvasHistoryId?: string }).canvasHistoryId
      if (!canvasHistoryId) {
        toast.error('This history entry has no restorable snapshot.')
        return
      }
      try {
        await configurationCanvasApi.restoreVersion(config.id, canvasHistoryId)
        toast.success('Restored to the selected version.')
        await loadHistory()
        onChanged()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to restore version')
      }
    },
    [config.id, toast, loadHistory, onChanged],
  )

  // Stable close handlers — passing an inline arrow to FormDialog/ApprovalSubmissionDialog
  // would re-run their focus-management effects on every keystroke and steal focus.
  const closeReject = useCallback(() => setRejectOpen(false), [])
  const closeReRequest = useCallback(() => setReRequestOpen(false), [])

  const summary = approvals?.summary

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Reviews for ${config.name}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-50 flex h-full w-full max-w-3xl flex-col bg-gray-50 shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <GitPullRequest className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reviews · {config.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                v{config.version} · {canvasStatus.replace(/_/g, ' ').toLowerCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close reviews"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Reviewers */}
          <Section
            title="Reviewers"
            right={
              summary ? (
                <Badge variant={summary.approved >= summary.total && summary.total > 0 ? 'success' : 'secondary'}>
                  Approved {summary.approved}/{summary.total}
                </Badge>
              ) : undefined
            }
          >
            {loadingApprovals ? (
              <div className="flex items-center justify-center py-6" role="status" aria-label="Loading reviewers">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
              </div>
            ) : (
              <>
                {submissionComment && (
                  <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Description
                    </div>
                    <p className="whitespace-pre-wrap break-words">{submissionComment}</p>
                  </div>
                )}

                {!approvals || approvals.approvals.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No reviewers assigned yet. Submit this configuration for approval to request review.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {approvals.approvals.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {a.approver.name || a.approver.email}
                            </span>
                            <Badge variant={REVIEWER_STATUS_VARIANT[a.status]} size="sm">
                              {a.status.toLowerCase()}
                            </Badge>
                          </div>
                          {a.comment && (
                            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{a.comment}</p>
                          )}
                          {a.environments.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.environments.map((e) => (
                                <span
                                  key={e.id}
                                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                >
                                  {e.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-xs text-gray-400">
                          {a.respondedAt ? new Date(a.respondedAt).toLocaleDateString() : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Reviewer controls */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {canAct && (
                    <>
                      <Button
                        variant="success"
                        size="sm"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        isLoading={actionBusy === 'approve'}
                        onClick={() => void handleApprove()}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<MessageSquareWarning className="h-4 w-4" />}
                        disabled={actionBusy !== null}
                        onClick={() => setRejectOpen(true)}
                      >
                        Request changes
                      </Button>
                    </>
                  )}
                  {canvasStatus === 'CHANGES_REQUESTED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                      onClick={() => setReRequestOpen(true)}
                    >
                      Re-request review
                    </Button>
                  )}
                  {!canAct && canvasStatus === 'PENDING_APPROVAL' && isAssignedReviewer && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      You have already responded to this review.
                    </span>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* Version control: timeline + diff + restore */}
          <Section title="Commits & Changes">
            <VersionControlPanel
              entityType="CONFIGURATION_CANVAS"
              entityId={config.id}
              showApprovals={false}
              showTimeline
              showCompare
              showExport
              onRevert={handleRevert}
            />
          </Section>

          {/* Threaded comments (optionally anchored to a version) */}
          <Section
            title="Discussion"
            right={
              <select
                value={selectedHistoryId}
                onChange={(e) => setSelectedHistoryId(e.target.value)}
                aria-label="Anchor comments to a version"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              >
                <option value="">All versions</option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    v{h.version} · {h.action.toLowerCase()}
                  </option>
                ))}
              </select>
            }
          >
            <CommentThread
              canvasId={config.id}
              historyId={selectedHistoryId || undefined}
              currentUserId={currentUserId}
              canModerate={isAssignedReviewer}
            />
          </Section>
        </div>
      </div>

      {/* Request-changes reason dialog */}
      <FormDialog
        isOpen={rejectOpen}
        onClose={closeReject}
        title="Request changes"
        description="Explain what needs to change. The configuration moves to “Changes requested”."
        onSubmit={handleReject}
        submitText="Request changes"
        isSubmitting={actionBusy === 'reject'}
        submitDisabled={!rejectReason.trim()}
      >
        <Textarea
          label="Reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Describe the requested changes…"
          rows={4}
          aria-label="Rejection reason"
        />
      </FormDialog>

      {/* Re-request review dialog (reuses the shared approval submission dialog) */}
      <ApprovalSubmissionDialog
        isOpen={reRequestOpen}
        onClose={closeReRequest}
        onSubmit={handleReRequest}
        configName={config.name}
        fetchUsers={fetchUsers}
        fetchTags={fetchTags}
        initialSelectedEnvironments={config.tags?.map((t) => t.tagId) ?? []}
      />
    </div>
  )
}

export default ReviewsDrawer

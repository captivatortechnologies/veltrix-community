// ========================================================================
// CommentThread — GitHub-PR-style threaded review comments for a
// configuration canvas. Backed by the configuration-canvas comment endpoints
// (getComments / addComment / updateComment / deleteComment). Comments can
// optionally be anchored to a specific version (historyId) and replied to,
// forming threads. Reviewers/authors can resolve and delete.
// ========================================================================

import React, { useCallback, useEffect, useState } from 'react'
import { MessageSquare, CornerDownRight, Check, RotateCcw, Trash2, Loader2, Send } from 'lucide-react'
import { configurationCanvasApi } from '@/components/shared/ConfigurationCanvas'
import type { ReviewComment } from '@/components/shared/ConfigurationCanvas'
import { Button } from '@/components/shared/Button'
import { Textarea } from '@/components/shared/Textarea'
import { Badge } from '@/components/shared/Badge'
import { useToast } from '@/components/shared/Toast'

export interface CommentThreadProps {
  canvasId: string
  /** When set, only threads anchored to this version are shown, and new comments anchor to it. */
  historyId?: string
  /** Signed-in user id — used to decide which delete/resolve controls to show. */
  currentUserId?: string
  /** True when the signed-in user is an assigned reviewer (may resolve/delete any comment). */
  canModerate?: boolean
  className?: string
}

function initials(name?: string, email?: string): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const Avatar: React.FC<{ name?: string; email?: string }> = ({ name, email }) => (
  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
    {initials(name, email)}
  </div>
)

interface CommentItemProps {
  comment: ReviewComment
  depth: number
  canvasId: string
  currentUserId?: string
  canModerate?: boolean
  onReply: (parentId: string, body: string) => Promise<void>
  onToggleResolved: (comment: ReviewComment) => Promise<void>
  onDelete: (comment: ReviewComment) => Promise<void>
  busyId: string | null
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  depth,
  canvasId,
  currentUserId,
  canModerate,
  onReply,
  onToggleResolved,
  onDelete,
  busyId,
}) => {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isAuthor = currentUserId != null && comment.userId === currentUserId
  const canManage = isAuthor || Boolean(canModerate)
  const busy = busyId === comment.id

  const submitReply = useCallback(async () => {
    if (!replyBody.trim()) return
    setSubmitting(true)
    try {
      await onReply(comment.id, replyBody.trim())
      setReplyBody('')
      setReplyOpen(false)
    } finally {
      setSubmitting(false)
    }
  }, [replyBody, comment.id, onReply])

  return (
    <div
      className={depth > 0 ? 'mt-3 border-l-2 border-gray-200 pl-4 dark:border-gray-700' : 'mt-3'}
      data-testid="review-comment"
    >
      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <Avatar name={comment.user?.name} email={comment.user?.email} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {comment.user?.name || comment.user?.email || 'Unknown'}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
              {comment.resolved && (
                <Badge variant="success" size="sm">
                  Resolved
                </Badge>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">
              {comment.body}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
              >
                <CornerDownRight className="h-3.5 w-3.5" />
                Reply
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => void onToggleResolved(comment)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-green-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-green-400"
                >
                  {comment.resolved ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reopen
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Resolve
                    </>
                  )}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => void onDelete(comment)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-red-400"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </button>
              )}
            </div>

            {replyOpen && (
              <div className="mt-3">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={2}
                  aria-label="Reply"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Send className="h-3.5 w-3.5" />}
                    isLoading={submitting}
                    disabled={!replyBody.trim()}
                    onClick={() => void submitReply()}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              canvasId={canvasId}
              currentUserId={currentUserId}
              canModerate={canModerate}
              onReply={onReply}
              onToggleResolved={onToggleResolved}
              onDelete={onDelete}
              busyId={busyId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const CommentThread: React.FC<CommentThreadProps> = ({
  canvasId,
  historyId,
  currentUserId,
  canModerate,
  className = '',
}) => {
  const toast = useToast()
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await configurationCanvasApi.getComments(canvasId, { historyId })
      setComments(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }, [canvasId, historyId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const postComment = useCallback(async () => {
    if (!newBody.trim()) return
    setPosting(true)
    try {
      await configurationCanvasApi.addComment(canvasId, { body: newBody.trim(), historyId })
      setNewBody('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add comment')
    } finally {
      setPosting(false)
    }
  }, [newBody, canvasId, historyId, load, toast])

  const handleReply = useCallback(
    async (parentId: string, body: string) => {
      try {
        await configurationCanvasApi.addComment(canvasId, { body, parentId, historyId })
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to reply')
      }
    },
    [canvasId, historyId, load, toast],
  )

  const handleToggleResolved = useCallback(
    async (comment: ReviewComment) => {
      setBusyId(comment.id)
      try {
        await configurationCanvasApi.updateComment(canvasId, comment.id, { resolved: !comment.resolved })
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update comment')
      } finally {
        setBusyId(null)
      }
    },
    [canvasId, load, toast],
  )

  const handleDelete = useCallback(
    async (comment: ReviewComment) => {
      setBusyId(comment.id)
      try {
        await configurationCanvasApi.deleteComment(canvasId, comment.id)
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete comment')
      } finally {
        setBusyId(null)
      }
    },
    [canvasId, load, toast],
  )

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Comments{historyId ? ' (this version)' : ''}
        </h4>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Loading comments">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
          No comments yet. Start the review conversation below.
        </p>
      ) : (
        <div>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              depth={0}
              canvasId={canvasId}
              currentUserId={currentUserId}
              canModerate={canModerate}
              onReply={handleReply}
              onToggleResolved={handleToggleResolved}
              onDelete={handleDelete}
              busyId={busyId}
            />
          ))}
        </div>
      )}

      {/* New top-level comment */}
      <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a review comment…"
          rows={3}
          aria-label="Add a comment"
        />
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Send className="h-4 w-4" />}
            isLoading={posting}
            disabled={!newBody.trim()}
            onClick={() => void postComment()}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CommentThread

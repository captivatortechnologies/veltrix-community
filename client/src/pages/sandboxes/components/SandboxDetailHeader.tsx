import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FlaskConical, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '../../../components/shared/Badge'
import { Button } from '../../../components/shared/Button'
import { formatRelativeTime, formatTimestamp } from '../../../components/shared/VersionControl'
import type { Sandbox } from '../../../services/sandboxApi'
import { STATUS_BADGES, STATUS_LABELS, STATUS_DESCRIPTIONS, formatRelativeExpiry } from '../sandbox.format'
import { CopyDevCommand } from './CopyDevCommand'

export interface SandboxDetailHeaderProps {
  sandbox: Sandbox
  onDelete: () => void
  deleting: boolean
  onRefresh: () => void
  refreshing: boolean
  onCopied: () => void
}

/**
 * Header for the sandbox detail page: identity, status, last-sync/expiry
 * (relative label, absolute timestamp in the title tooltip), the CLI
 * dev-loop snippet, and the primary Refresh/Delete actions.
 */
export const SandboxDetailHeader: React.FC<SandboxDetailHeaderProps> = ({
  sandbox,
  onDelete,
  deleting,
  onRefresh,
  refreshing,
  onCopied,
}) => {
  const expiry = formatRelativeExpiry(sandbox.expiresAt)

  return (
    <div className="space-y-3">
      <Link
        to="/sandboxes"
        className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to Sandboxes
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2 flex-wrap">
            <FlaskConical className="text-primary shrink-0" size={24} aria-hidden="true" />
            <span className="break-all">{sandbox.name}</span>
            <Badge
              variant={STATUS_BADGES[sandbox.status]}
              size="sm"
              dot
              title={STATUS_DESCRIPTIONS[sandbox.status]}
            >
              {STATUS_LABELS[sandbox.status]}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            App <span className="font-mono text-content-primary">{sandbox.appId}</span>
            <span className="mx-2 text-content-tertiary" aria-hidden="true">
              ·
            </span>
            Last sync{' '}
            {sandbox.lastSyncAt ? (
              <time dateTime={sandbox.lastSyncAt} title={formatTimestamp(sandbox.lastSyncAt)}>
                {formatRelativeTime(sandbox.lastSyncAt)}
              </time>
            ) : (
              <span>never</span>
            )}
            <span className="mx-2 text-content-tertiary" aria-hidden="true">
              ·
            </span>
            <time
              dateTime={sandbox.expiresAt}
              title={formatTimestamp(sandbox.expiresAt)}
              className={expiry.isExpired ? 'text-danger font-medium' : undefined}
            >
              {expiry.label}
            </time>
          </p>

          <div className="mt-3 flex items-center gap-2">
            {/* Theme-stable terminal look — see SandboxesPage.tsx for why bg-content-primary/
                text-content-inverse aren't used here (both resolve near-white in dark mode). */}
            <pre className="bg-gray-900 text-gray-100 text-xs rounded-md px-3 py-2 font-mono whitespace-pre overflow-x-auto">
              veltrix dev &lt;your-app-dir&gt; --sandbox {sandbox.name}
            </pre>
            <CopyDevCommand sandboxName={sandbox.name} onCopied={onCopied} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh sandbox"
            leftIcon={<RefreshCw size={16} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />}
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            isLoading={deleting}
            aria-label={`Delete sandbox ${sandbox.name}`}
            leftIcon={<Trash2 size={16} className="text-danger" aria-hidden="true" />}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SandboxDetailHeader

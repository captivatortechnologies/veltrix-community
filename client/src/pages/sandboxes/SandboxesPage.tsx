import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, RefreshCw, Terminal, Trash2 } from 'lucide-react'
import { Badge } from '../../components/shared/Badge'
import { Button } from '../../components/shared/Button'
import { Card, CardBody } from '../../components/shared/Card'
import { EmptyState } from '../../components/shared/EmptyState'
import { Skeleton } from '../../components/shared/Skeleton'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { useToast } from '../../components/shared/Toast'
import { formatRelativeTime, formatTimestamp } from '../../components/shared/VersionControl'
import { useFeatureFlags } from '../../contexts/FeatureFlagContext'
import { sandboxApi, type Sandbox } from '../../services/sandboxApi'
import { CopyDevCommand } from './components/CopyDevCommand'
import {
  STATUS_BADGES,
  STATUS_LABELS,
  STATUS_DESCRIPTIONS,
  formatFilesSummary,
  formatRelativeExpiry,
  CLI_SNIPPET,
} from './sandbox.format'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SandboxesPage: React.FC = () => {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { confirm } = useConfirmDialog()
  const toast = useToast()
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()

  const sandboxFeatureEnabled = isEnabled('platform.sandbox')

  const loadSandboxes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sandboxApi.list()
      setSandboxes(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load sandboxes')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (flagsLoading || !sandboxFeatureEnabled) {
      setLoading(false)
      return
    }
    loadSandboxes()
  }, [flagsLoading, sandboxFeatureEnabled, loadSandboxes])

  const handleDelete = async (sandbox: Sandbox) => {
    const confirmed = await confirm({
      title: 'Delete sandbox',
      message: `Delete the sandbox "${sandbox.name}" and all of its synced files? Your local files are not affected — you can recreate the sandbox with the Veltrix CLI at any time.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    setDeletingId(sandbox.id)
    try {
      await sandboxApi.delete(sandbox.id)
      setSandboxes((prev) => prev.filter((s) => s.id !== sandbox.id))
      toast.success(`Sandbox "${sandbox.name}" deleted`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete sandbox')
    } finally {
      setDeletingId(null)
    }
  }

  // Feature disabled for this deployment/tenant
  if (!flagsLoading && !sandboxFeatureEnabled) {
    return (
      <div className="space-y-6">
        <PageHeader onRefresh={loadSandboxes} refreshDisabled />
        <Card>
          <CardBody>
            <EmptyState
              icon={<FlaskConical size={48} />}
              title="Sandboxes are not enabled"
              description="Developer sandboxes are not enabled for this workspace yet. Contact your Veltrix administrator to join the sandbox rollout."
            />
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader onRefresh={loadSandboxes} refreshDisabled={loading} />

      {loading ? (
        <Card>
          <CardBody>
            <div className="space-y-3">
              <Skeleton variant="rectangular" height={40} />
              <Skeleton variant="rectangular" height={40} />
              <Skeleton variant="rectangular" height={40} />
            </div>
          </CardBody>
        </Card>
      ) : sandboxes.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<FlaskConical size={48} aria-hidden="true" />}
              title="No sandboxes yet"
              description="Sandboxes let you run a work-in-progress app inside your own tenant while you develop it locally. Create one from your terminal with the Veltrix CLI, then start the dev loop:"
              action={
                <div className="text-left inline-block">
                  {/* Deliberately theme-stable (not bg-content-primary/text-content-inverse):
                      those tokens both resolve near-white in dark mode, which would make this
                      terminal-style block unreadable. A code/terminal panel is conventionally
                      dark regardless of the app's light/dark theme. */}
                  <pre className="bg-gray-900 text-gray-100 text-sm rounded-lg px-4 py-3 font-mono whitespace-pre overflow-x-auto">
                    {CLI_SNIPPET}
                  </pre>
                  <p className="mt-3 text-xs text-content-tertiary flex items-center gap-1.5">
                    <Terminal size={14} aria-hidden="true" />
                    Requires an API key with the sandbox:write scope (Settings → Keys &amp; Tokens)
                  </p>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-hover">
                <tr>
                  {['Name', 'App', 'Status', 'Files', 'Last sync', 'Expires', ''].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-content-tertiary"
                    >
                      {header === '' ? <span className="sr-only">Actions</span> : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sandboxes.map((sandbox) => {
                  const expiry = formatRelativeExpiry(sandbox.expiresAt)
                  return (
                    <tr key={sandbox.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FlaskConical size={16} className="text-primary shrink-0" aria-hidden="true" />
                          <Link
                            to={`/sandboxes/${sandbox.id}`}
                            className="font-medium text-content-primary hover:text-primary hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {sandbox.name}
                          </Link>
                          <CopyDevCommand
                            sandboxName={sandbox.name}
                            onCopied={() => toast.success('Dev command copied to clipboard')}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-secondary">
                        {sandbox.appId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge
                          variant={STATUS_BADGES[sandbox.status]}
                          size="sm"
                          dot
                          title={STATUS_DESCRIPTIONS[sandbox.status]}
                        >
                          {STATUS_LABELS[sandbox.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-secondary">
                        {formatFilesSummary(sandbox.fileCount, sandbox.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-secondary">
                        {sandbox.lastSyncAt ? (
                          <time
                            dateTime={sandbox.lastSyncAt}
                            title={formatTimestamp(sandbox.lastSyncAt)}
                          >
                            {formatRelativeTime(sandbox.lastSyncAt)}
                          </time>
                        ) : (
                          <span className="text-content-tertiary">Never synced</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <time
                          dateTime={sandbox.expiresAt}
                          title={formatTimestamp(sandbox.expiresAt)}
                          className={expiry.isExpired ? 'text-danger font-medium' : 'text-content-secondary'}
                        >
                          {expiry.label}
                        </time>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(sandbox)}
                          isLoading={deletingId === sandbox.id}
                          aria-label={`Delete sandbox ${sandbox.name}`}
                          leftIcon={<Trash2 size={16} className="text-danger" aria-hidden="true" />}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  onRefresh: () => void
  refreshDisabled?: boolean
}

const PageHeader: React.FC<PageHeaderProps> = ({ onRefresh, refreshDisabled = false }) => (
  <div className="flex items-start justify-between gap-4 flex-wrap">
    <div>
      <h1 className="text-2xl font-bold text-content-primary flex items-center gap-2">
        <FlaskConical className="text-primary" size={24} aria-hidden="true" />
        Sandboxes
      </h1>
      <p className="mt-1 text-sm text-content-secondary max-w-2xl">
        Tenant-scoped environments for developing apps locally with the Veltrix CLI. Code synced
        into a sandbox stays private to this tenant and expires automatically when idle.
      </p>
    </div>
    <Button
      variant="secondary"
      size="sm"
      onClick={onRefresh}
      disabled={refreshDisabled}
      leftIcon={<RefreshCw size={16} aria-hidden="true" />}
    >
      Refresh
    </Button>
  </div>
)

export default SandboxesPage

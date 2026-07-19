import React, { useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Package, Terminal, Plus } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../../components/shared/Card'
import { Badge } from '../../../components/shared/Badge'
import { Button } from '../../../components/shared/Button'
import { EmptyState } from '../../../components/shared/EmptyState'
import type { SandboxManifestSummary } from '../../../services/sandboxApi'
import { CLI_SNIPPET } from '../sandbox.format'
import { AddConfigTypeDialog } from './AddConfigTypeDialog'

export interface SandboxManifestCardProps {
  manifest: SandboxManifestSummary | null
  /** Sandbox id + client id enable the "Add configuration type" action (omitted → read-only card). */
  sandboxId?: string
  originClientId?: string
  /** Fired after a config type is scaffolded so the page can refresh manifest + files. */
  onConfigTypeAdded?: () => void
}

/**
 * Manifest + live validation summary: app identity, configuration types
 * with their declared handlers, and the current validity (errors/warnings)
 * of what's synced right now. `manifest` is null until the sandbox has
 * completed its first sync — the CLI snippet doubles as the empty-state
 * call to action in that case.
 */
export const SandboxManifestCard: React.FC<SandboxManifestCardProps> = ({
  manifest,
  sandboxId,
  originClientId,
  onConfigTypeAdded,
}) => {
  const [addOpen, setAddOpen] = useState(false)
  // The add action needs a synced manifest to patch + the sandbox/client ids.
  const canAdd = Boolean(manifest && sandboxId && originClientId)

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-content-primary flex items-center gap-2">
            <Package size={18} className="text-primary" aria-hidden="true" />
            Manifest
          </h2>
          {canAdd && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={16} aria-hidden="true" />}
              onClick={() => setAddOpen(true)}
            >
              Add configuration type
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {!manifest ? (
          <EmptyState
            icon={<Package size={40} aria-hidden="true" />}
            title="Not synced yet"
            description="This sandbox has no synced files yet. Start the dev loop from your terminal:"
            action={
              <div className="text-left inline-block">
                {/* Theme-stable terminal look — see SandboxesPage.tsx for why bg-content-primary/
                    text-content-inverse aren't used here (both resolve near-white in dark mode). */}
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
        ) : (
          <div className="space-y-4">
            {/* Identity */}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-content-tertiary">App ID</dt>
                <dd className="font-mono text-content-primary">{manifest.appId || '—'}</dd>
              </div>
              <div>
                <dt className="text-content-tertiary">Name</dt>
                <dd className="text-content-primary">{manifest.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-content-tertiary">Version</dt>
                <dd className="text-content-primary">{manifest.version || '—'}</dd>
              </div>
            </dl>

            {/* Validation banner */}
            <div
              className={`rounded-lg border overflow-hidden ${
                manifest.valid
                  ? 'border-success-subtle bg-success-subtle'
                  : 'border-danger-subtle bg-danger-subtle'
              }`}
              role="status"
            >
              <div className="px-4 py-2.5 flex items-center gap-2">
                {manifest.valid ? (
                  <>
                    <CheckCircle2 size={18} className="text-success shrink-0" aria-hidden="true" />
                    <span className="font-medium text-success-subtle-foreground">
                      Valid — {manifest.transpiledCount} server source
                      {manifest.transpiledCount === 1 ? '' : 's'} transpiled
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle size={18} className="text-danger shrink-0" aria-hidden="true" />
                    <span className="font-medium text-danger-subtle-foreground">
                      Invalid — {manifest.errors.length} error{manifest.errors.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
                {manifest.warnings.length > 0 && (
                  <span className="ml-auto text-xs text-warning-subtle-foreground flex items-center gap-1">
                    <AlertTriangle size={14} aria-hidden="true" />
                    {manifest.warnings.length} warning{manifest.warnings.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {manifest.errors.length > 0 && (
                <ul className="border-t border-danger-subtle divide-y divide-danger-subtle">
                  {manifest.errors.map((err, i) => (
                    <li key={i} className="px-4 py-2 text-sm text-content-primary flex items-start gap-2">
                      <XCircle size={14} className="text-danger mt-0.5 shrink-0" aria-hidden="true" />
                      {err}
                    </li>
                  ))}
                </ul>
              )}
              {manifest.warnings.length > 0 && (
                <ul className="border-t border-warning-subtle divide-y divide-warning-subtle">
                  {manifest.warnings.map((warn, i) => (
                    <li key={i} className="px-4 py-2 text-sm text-content-primary flex items-start gap-2">
                      <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" aria-hidden="true" />
                      {warn}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Configuration types */}
            <div>
              <h3 className="text-sm font-medium text-content-primary mb-2">
                Configuration types ({manifest.configTypes.length})
              </h3>
              {manifest.configTypes.length === 0 ? (
                <p className="text-sm text-content-tertiary">
                  No configuration types declared — fix the manifest errors above and resync.
                </p>
              ) : (
                <ul className="space-y-2">
                  {manifest.configTypes.map((ct) => (
                    <li key={ct.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-content-primary">{ct.name}</span>
                        <span className="text-xs font-mono text-content-tertiary">{ct.id}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ct.handlers.map((handler) => (
                          <Badge key={handler} variant="secondary" size="sm">
                            {handler}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardBody>

      {canAdd && (
        <AddConfigTypeDialog
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          sandboxId={sandboxId!}
          originClientId={originClientId!}
          onAdded={() => onConfigTypeAdded?.()}
        />
      )}
    </Card>
  )
}

export default SandboxManifestCard

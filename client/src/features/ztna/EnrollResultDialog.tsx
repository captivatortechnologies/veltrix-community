import React, { useState } from 'react'
import { Copy, Check, ShieldAlert, Terminal } from 'lucide-react'
import { Modal } from '../../components/shared/Modal'
import { Button } from '../../components/shared/Button'
import { Alert } from '../../components/shared/Alert'
import type { ZtnaEnrollResult } from '../../services/ztnaApi'

interface EnrollResultDialogProps {
  result: ZtnaEnrollResult | null
  onClose: () => void
}

/**
 * Shows the one-time enrollment output: the tag-scoped Tailscale auth key is
 * embedded in a ready-to-run install command. The key is NEVER retrievable
 * again, so the dialog leads with that warning and makes copying frictionless.
 * Used by the tenant self-service Remote Access page.
 */
export const EnrollResultDialog: React.FC<EnrollResultDialogProps> = ({ result, onClose }) => {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.installCommands)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the user can still select the text manually */
    }
  }

  const expiryText = result?.expiresAt
    ? new Date(result.expiresAt).toLocaleString()
    : 'the configured key lifetime'

  return (
    <Modal
      isOpen={result !== null}
      onClose={onClose}
      title="Server enrollment key"
      subtitle={result ? `Tagged ${result.tag}` : undefined}
      size="lg"
      disableBackdropClose
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {result && (
        <div className="space-y-4">
          <Alert variant="warning" title="Copy this now — it is shown only once">
            The authentication key below is embedded in the install command and cannot be retrieved
            again. It expires at {expiryText}. Run the command on the server you want to link.
          </Alert>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-content-secondary">
              <Terminal className="h-4 w-4" aria-hidden="true" />
              Run on the target server (Linux)
            </div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface p-4 pr-12 text-xs leading-relaxed text-content-primary">
                <code>{result.installCommands}</code>
              </pre>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy install command"
                className="absolute right-2 top-2 rounded-md border border-border bg-surface-raised p-2 text-content-tertiary transition-colors hover:text-content-primary"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs text-content-tertiary">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            The device joins the Veltrix tailnet already tagged for this tenant, so network ACLs
            isolate it from every other customer automatically. It appears under Devices once it
            connects.
          </p>
        </div>
      )}
    </Modal>
  )
}

export default EnrollResultDialog

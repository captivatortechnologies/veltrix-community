import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { buildDevCommand } from '../sandbox.format'

// ---------------------------------------------------------------------------
// CopyDevCommand — inline "copy the CLI dev-loop command" affordance for a
// sandbox. Shows the exact command as a native tooltip (no shared Tooltip
// component existed when this was first written) and copies it to the
// clipboard on click. Shared between the sandbox list row and the detail
// page header.
// ---------------------------------------------------------------------------

export interface CopyDevCommandProps {
  sandboxName: string
  onCopied: () => void
  /** Extra classes for the trigger button (e.g. size adjustments per usage site). */
  className?: string
}

export const CopyDevCommand: React.FC<CopyDevCommandProps> = ({
  sandboxName,
  onCopied,
  className = '',
}) => {
  const [justCopied, setJustCopied] = useState(false)
  const command = buildDevCommand(sandboxName)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setJustCopied(true)
      onCopied()
      window.setTimeout(() => setJustCopied(false), 2000)
    } catch {
      // Clipboard API unavailable/denied — the command is still visible via the title
      // tooltip so the user can select and copy it manually.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={command}
      aria-label={`Copy CLI dev command for sandbox ${sandboxName}: ${command}`}
      className={`inline-flex items-center justify-center p-1 rounded text-content-tertiary hover:text-primary hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {justCopied ? (
        <Check size={14} className="text-success" aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
    </button>
  )
}

export default CopyDevCommand

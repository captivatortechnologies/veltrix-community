import React, { useCallback, useState } from 'react'
import { FormDialog } from '../../../components/shared/FormDialog'
import { Input } from '../../../components/shared/Input'
import { useToast } from '../../../components/shared/Toast'
import { sandboxApi } from '../../../services/sandboxApi'

export interface AddConfigTypeDialogProps {
  isOpen: boolean
  onClose: () => void
  sandboxId: string
  /** Echoed back on the resulting file-changed events so the editor echo-guards its own scaffold. */
  originClientId: string
  /** Fired after a successful add so the page can refresh manifest + files. */
  onAdded: (configTypeId: string, createdPaths: string[]) => void
}

// Mirror the server slug rule (config-type-scaffold.ts) so the user gets
// instant feedback instead of a round-trip 400.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

function slugError(id: string): string | null {
  if (!id) return null // empty is "incomplete", not "invalid" — submit stays disabled
  if (id.length < 2) return 'Use at least 2 characters'
  if (!SLUG_RE.test(id)) return 'Lowercase letters, digits and single hyphens; must start and end alphanumeric'
  return null
}

/**
 * Scaffold a new configuration type into the sandbox app. Writes the canonical
 * config-types/<id>/ layout (canvas + defaults + the six handlers) and a
 * manifest entry server-side; the new files reverse-sync to the developer's
 * local workspace via sandbox:file-changed.
 */
export const AddConfigTypeDialog: React.FC<AddConfigTypeDialogProps> = ({
  isOpen,
  onClose,
  sandboxId,
  originClientId,
  onAdded,
}) => {
  const toast = useToast()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [componentTypes, setComponentTypes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const idError = slugError(id)
  const canSubmit = id.length >= 2 && !idError

  const reset = () => {
    setId('')
    setName('')
    setComponentTypes('')
  }

  // Stable across keystrokes: FormDialog's focus effect keys on onClose, so an
  // identity that changed on every render would steal focus from the fields
  // mid-type. `submitting` only flips during a submit, never while typing.
  const handleClose = useCallback(() => {
    if (submitting) return
    setId('')
    setName('')
    setComponentTypes('')
    onClose()
  }, [submitting, onClose])

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await sandboxApi.addConfigType(sandboxId, {
        id,
        name: name.trim() || undefined,
        componentTypes: componentTypes
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        originClientId,
      })
      toast.success(
        `Configuration type "${result.configTypeId}" scaffolded — ${result.createdPaths.length} files added`,
      )
      onAdded(result.configTypeId, result.createdPaths)
      reset()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add configuration type')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Add configuration type"
      description="Scaffolds the canonical config-types/<id>/ layout — canvas, defaults, and the six pipeline handlers — plus a manifest entry. The new files sync to your local workspace."
      onSubmit={handleSubmit}
      submitText="Add configuration type"
      isSubmitting={submitting}
      submitDisabled={!canSubmit}
      size="md"
    >
      <div className="space-y-4">
        <Input
          label="ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="e.g. detections"
          error={idError ?? undefined}
          helperText={idError ? undefined : 'Folder + manifest id. Lowercase slug, e.g. "threat-intel".'}
          autoFocus
          fullWidth
          spellCheck={false}
          autoComplete="off"
        />
        <Input
          label="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Defaults to a title-cased id"
          helperText="Human-readable label shown in the pipeline and canvas."
          fullWidth
        />
        <Input
          label="Component types (optional)"
          value={componentTypes}
          onChange={(e) => setComponentTypes(e.target.value)}
          placeholder="comma-separated, e.g. server, forwarder"
          helperText="What this config type targets. Edit later in the manifest anytime."
          fullWidth
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </FormDialog>
  )
}

export default AddConfigTypeDialog

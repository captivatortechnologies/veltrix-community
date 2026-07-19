import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Save, Settings, AlertCircle } from 'lucide-react'
import { appService, type AppSettingValue } from '../../services/appService'
import { Button } from '../../components/shared/Button'
import { Input } from '../../components/shared/Input'
import { useToast } from '../../components/shared/Toast'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AppSettingsDialogProps {
  open: boolean
  appId: string
  appName: string
  onClose: () => void
  onSaved: () => void
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Map of setting key -> raw form value (always stored as string for inputs) */
type FormValues = Record<string, string | boolean>

// ---------------------------------------------------------------------------
// Helper: coerce a raw AppSettingValue into a form-compatible initial value
// ---------------------------------------------------------------------------

function toFormValue(setting: AppSettingValue): string | boolean {
  if (setting.type === 'boolean') {
    // Accept both boolean true/false and string "true"/"false"
    if (typeof setting.value === 'boolean') return setting.value
    return String(setting.value).toLowerCase() === 'true'
  }
  // For all other types stringify; null/undefined fall back to default or ''
  if (setting.value !== null && setting.value !== undefined) {
    return String(setting.value)
  }
  if (setting.default !== undefined && setting.default !== null) {
    return String(setting.default)
  }
  return ''
}

// ---------------------------------------------------------------------------
// Helper: build the payload for updateAppSettings from current form values
// ---------------------------------------------------------------------------

function buildPayload(
  settings: AppSettingValue[],
  formValues: FormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const setting of settings) {
    const raw = formValues[setting.key]

    if (setting.type === 'number') {
      const parsed = Number(raw)
      payload[setting.key] = isNaN(parsed) ? raw : parsed
    } else if (setting.type === 'boolean') {
      payload[setting.key] = Boolean(raw)
    } else {
      payload[setting.key] = raw
    }
  }

  return payload
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldRowProps {
  setting: AppSettingValue
  value: string | boolean
  onChange: (key: string, value: string | boolean) => void
  disabled: boolean
}

const FieldRow: React.FC<FieldRowProps> = ({ setting, value, onChange, disabled }) => {
  const fieldId = `app-setting-${setting.key}`

  const labelEl = (
    <label
      htmlFor={fieldId}
      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
    >
      {setting.label}
      {setting.required && (
        <span className="ml-1 text-red-500" aria-label="required">
          *
        </span>
      )}
    </label>
  )

  const descriptionEl = setting.description ? (
    <p id={`${fieldId}-desc`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
      {setting.description}
    </p>
  ) : null

  // ---- boolean: toggle switch ----
  if (setting.type === 'boolean') {
    const checked = Boolean(value)
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {labelEl}
          {descriptionEl}
        </div>
        <button
          id={fieldId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-describedby={setting.description ? `${fieldId}-desc` : undefined}
          disabled={disabled}
          onClick={() => onChange(setting.key, !checked)}
          className={`
            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out
            focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
            disabled:cursor-not-allowed disabled:opacity-50
            ${checked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600'}
          `}
        >
          <span className="sr-only">
            {checked ? 'Enabled' : 'Disabled'}
          </span>
          <span
            aria-hidden="true"
            className={`
              pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md
              ring-0 transition-transform duration-200 ease-in-out
              ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>
    )
  }

  // ---- select: dropdown ----
  if (setting.type === 'select') {
    const options = Array.isArray(setting.options) ? (setting.options as string[]) : []
    return (
      <div>
        {labelEl}
        <div className="relative">
          <select
            id={fieldId}
            value={String(value)}
            disabled={disabled}
            aria-describedby={setting.description ? `${fieldId}-desc` : undefined}
            onChange={(e) => onChange(setting.key, e.target.value)}
            className="
              w-full px-3 py-2 pr-8 text-sm rounded-md border
              bg-white dark:bg-gray-700
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
              appearance-none
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent
              disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
              disabled:text-gray-500 dark:disabled:text-gray-500
              transition-colors duration-200
            "
          >
            <option value="">Select an option...</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {/* Chevron decoration */}
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {descriptionEl}
      </div>
    )
  }

  // ---- number ----
  if (setting.type === 'number') {
    return (
      <Input
        id={fieldId}
        type="number"
        label={setting.label}
        helperText={setting.description}
        value={String(value)}
        disabled={disabled}
        required={setting.required}
        aria-describedby={setting.description ? `${fieldId}-desc` : undefined}
        onChange={(e) => onChange(setting.key, e.target.value)}
      />
    )
  }

  // ---- string (default) ----
  return (
    <Input
      id={fieldId}
      type="text"
      label={setting.label}
      helperText={setting.description}
      value={String(value)}
      disabled={disabled}
      required={setting.required}
      aria-describedby={setting.description ? `${fieldId}-desc` : undefined}
      onChange={(e) => onChange(setting.key, e.target.value)}
    />
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton for form fields
// ---------------------------------------------------------------------------

const FieldSkeleton: React.FC = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
    {[1, 2, 3].map((i) => (
      <div key={i} className="space-y-1.5">
        <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-9 w-full rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    ))}
  </div>
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const AppSettingsDialog: React.FC<AppSettingsDialogProps> = ({
  open,
  appId,
  appName,
  onClose,
  onSaved,
}) => {
  const { success: toastSuccess, error: toastError } = useToast()

  const [settings, setSettings] = useState<AppSettingValue[]>([])
  const [formValues, setFormValues] = useState<FormValues>({})
  const [isFetching, setIsFetching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Keep a stable reference to prevent stale-closure issues in the effect
  const appIdRef = useRef(appId)
  appIdRef.current = appId

  // Focus trap: move focus into the dialog on open
  const dialogRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Fetch settings whenever the dialog opens (or appId changes while open)
  // ---------------------------------------------------------------------------

  const fetchSettings = useCallback(async (id: string) => {
    setIsFetching(true)
    setFetchError(null)
    setSaveError(null)
    setSettings([])
    setFormValues({})

    try {
      const { settings: fetched } = await appService.getAppSettings(id)
      setSettings(fetched)
      const initial: FormValues = {}
      for (const s of fetched) {
        initial[s.key] = toFormValue(s)
      }
      setFormValues(initial)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load settings.')
    } finally {
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    fetchSettings(appId)
  }, [open, appId, fetchSettings])

  // Move focus into dialog on open
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus()
    }
  }, [open])

  // ---------------------------------------------------------------------------
  // Close / Escape handling
  // ---------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    if (isSaving) return
    onClose()
  }, [isSaving, onClose])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  // ---------------------------------------------------------------------------
  // Field change handler
  // ---------------------------------------------------------------------------

  const handleChange = useCallback((key: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [key]: value }))
    // Clear a previous save error as the user starts editing
    setSaveError(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    setSaveError(null)

    // Validate required fields
    const missing = settings
      .filter((s) => s.required)
      .filter((s) => {
        const v = formValues[s.key]
        return v === '' || v === null || v === undefined
      })

    if (missing.length > 0) {
      setSaveError(
        `Please fill in required fields: ${missing.map((s) => s.label).join(', ')}`,
      )
      return
    }

    setIsSaving(true)
    try {
      const payload = buildPayload(settings, formValues)
      await appService.updateAppSettings(appId, payload)
      toastSuccess(`Settings for "${appName}" saved successfully.`)
      onSaved()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings.'
      setSaveError(message)
      toastError(message)
    } finally {
      setIsSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Guard: don't render anything when closed
  // ---------------------------------------------------------------------------

  if (!open) return null

  const isInteractionDisabled = isFetching || isSaving

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        // Close only when clicking directly on the backdrop, not the card
        if (e.target === e.currentTarget) handleClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-settings-dialog-title"
      aria-describedby={fetchError ? 'app-settings-dialog-error' : undefined}
    >
      {/* Card */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="
          relative w-full max-w-lg
          bg-white dark:bg-gray-800
          rounded-xl shadow-2xl
          flex flex-col max-h-[90vh]
          focus:outline-none
        "
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings
              className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2
                id="app-settings-dialog-title"
                className="text-base font-semibold text-gray-900 dark:text-white truncate"
              >
                App Settings
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{appName}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            aria-label="Close dialog"
            className="
              ml-3 flex-shrink-0 p-1.5 rounded-md
              text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-700
              transition-colors duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
            "
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Body                                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Fetch error */}
          {fetchError && (
            <div
              id="app-settings-dialog-error"
              role="alert"
              className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            >
              <AlertCircle
                className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500 dark:text-red-400"
                aria-hidden="true"
              />
              <p className="text-sm text-red-700 dark:text-red-300">{fetchError}</p>
            </div>
          )}

          {/* Save error (inline, separate from toast) */}
          {saveError && !fetchError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            >
              <AlertCircle
                className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500 dark:text-red-400"
                aria-hidden="true"
              />
              <p className="text-sm text-red-700 dark:text-red-300">{saveError}</p>
            </div>
          )}

          {/* Loading skeleton */}
          {isFetching && <FieldSkeleton />}

          {/* Settings form */}
          {!isFetching && !fetchError && settings.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No configurable settings available for this app.
            </p>
          )}

          {!isFetching && settings.length > 0 && (
            <form
              id="app-settings-form"
              onSubmit={(e) => {
                e.preventDefault()
                handleSave()
              }}
              noValidate
              className="space-y-5"
            >
              {settings.map((setting) => (
                <FieldRow
                  key={setting.key}
                  setting={setting}
                  value={formValues[setting.key] ?? ''}
                  onChange={handleChange}
                  disabled={isInteractionDisabled}
                />
              ))}
            </form>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>

          <Button
            type="submit"
            form="app-settings-form"
            variant="primary"
            isLoading={isSaving}
            loadingText="Saving..."
            disabled={isFetching || isSaving || !!fetchError}
            leftIcon={<Save className="w-4 h-4" aria-hidden="true" />}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AppSettingsDialog

import React, { useState, useEffect } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Wifi } from 'lucide-react'
import type {
  TicketingConnection,
  CreateTicketingConnectionRequest,
  UpdateTicketingConnectionRequest,
  TestTicketingConnectionResponse,
} from '@/services/ticketingProviderApi'
import { ticketingProviderApi } from '@/services/ticketingProviderApi'
import type { TicketingProviderSchema, TicketingFieldDefinition } from '../ticketingProviderSchemas'

interface ProviderConfigDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  schema: TicketingProviderSchema
  existing?: TicketingConnection | null
}

/**
 * Create/edit dialog for a ticketing connection. Clone of
 * features/connectivity-providers/components/ProviderConfigDialog.tsx, with
 * two additions the ticketing shape needs: a top-level `instanceUrl` field
 * (ConnectivityProvider has no equivalent — everything lives in `config`) and
 * conditional fields (`showWhen`) so auth-method-specific inputs (basic vs
 * oauth2) don't all render at once.
 */
const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  onClose,
  onSaved,
  schema,
  existing,
}) => {
  const isEditing = !!existing

  const [name, setName] = useState('')
  const [instanceUrl, setInstanceUrl] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestTicketingConnectionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize form when dialog opens or the existing connection changes.
  useEffect(() => {
    if (!open) return
    if (existing) {
      setName(existing.name)
      setInstanceUrl(existing.instanceUrl)
      setIsDefault(existing.isDefault)
      const cfg: Record<string, string> = {}
      for (const field of schema.fields) {
        const val = existing.config[field.name]
        cfg[field.name] = typeof val === 'string' ? val : ''
      }
      if (!cfg.authMethod) cfg.authMethod = schema.defaultAuthMethod
      setConfig(cfg)
    } else {
      setName(schema.displayName)
      setInstanceUrl('')
      setIsDefault(false)
      const cfg: Record<string, string> = {}
      for (const field of schema.fields) {
        cfg[field.name] = field.name === 'authMethod' ? schema.defaultAuthMethod : ''
      }
      setConfig(cfg)
    }
    setTestResult(null)
    setError(null)
  }, [open, existing, schema])

  const handleConfigChange = (fieldName: string, value: string) => {
    setConfig((prev) => ({ ...prev, [fieldName]: value }))
  }

  const isFieldVisible = (field: TicketingFieldDefinition): boolean =>
    !field.showWhen || config[field.showWhen.field] === field.showWhen.equals

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      // Strip empty/masked values and fields hidden by the current auth method.
      const cleanConfig: Record<string, unknown> = {}
      for (const field of schema.fields) {
        if (!isFieldVisible(field)) continue
        const val = config[field.name]
        if (val !== '' && val !== undefined && !val.startsWith('••••••')) {
          cleanConfig[field.name] = val
        }
      }

      if (isEditing && existing) {
        const updateData: UpdateTicketingConnectionRequest = {
          name,
          instanceUrl,
          config: cleanConfig,
        }
        await ticketingProviderApi.update(existing.id, updateData)
      } else {
        const createData: CreateTicketingConnectionRequest = {
          provider: schema.provider,
          name,
          instanceUrl,
          config: cleanConfig,
          isDefault,
        }
        await ticketingProviderApi.create(createData)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ticketing connection')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!existing) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await ticketingProviderApi.testConnection(existing.id)
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!open) return null

  const visibleFields = schema.fields.filter(isFieldVisible)
  const requiredFields = visibleFields.filter((f) => f.required)
  const hasRequiredValues = requiredFields.every((f) => {
    const val = config[f.name]
    return val && val.trim() !== '' && !val.startsWith('••••••')
  })
  // For editing, allow save even if masked values present (server preserves them).
  const canSave =
    name.trim() !== '' && instanceUrl.trim() !== '' && (isEditing || hasRequiredValues)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{schema.icon}</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEditing ? 'Edit' : 'Configure'} {schema.displayName}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{schema.shortDescription}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{schema.description}</p>

          {/* Name field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={`e.g. Production ${schema.displayName}`}
            />
          </div>

          {/* Instance URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Instance URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={
                schema.provider === 'servicenow'
                  ? 'https://your-instance.service-now.com'
                  : 'https://your-subdomain.zendesk.com'
              }
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              The base URL of your {schema.displayName} instance.
            </p>
          </div>

          {/* Dynamic config fields (auth-method-gated) */}
          {visibleFields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={config[field.name] || ''}
              onChange={(val) => handleConfigChange(field.name, val)}
            />
          ))}

          {/* Default toggle */}
          {!isEditing && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              Set as default ticketing connection
            </label>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <div>
                <p>{testResult.message}</p>
                {testResult.latencyMs != null && (
                  <p className="text-xs mt-1 opacity-75">Latency: {testResult.latencyMs}ms</p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <div>
            {isEditing && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                Test Connection
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldInput — renders the appropriate input for a field definition
// ---------------------------------------------------------------------------

const FieldInput: React.FC<{
  field: TicketingFieldDefinition
  value: string
  onChange: (value: string) => void
}> = ({ field, value, onChange }) => {
  const labelEl = (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )

  const helpEl = field.helpText ? (
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
  ) : null

  const baseClasses =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent'

  if (field.type === 'textarea') {
    return (
      <div>
        {labelEl}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${baseClasses} font-mono text-xs`}
        />
        {helpEl}
      </div>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div>
        {labelEl}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClasses}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {helpEl}
      </div>
    )
  }

  return (
    <div>
      {labelEl}
      <input
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={baseClasses}
      />
      {helpEl}
    </div>
  )
}

export default ProviderConfigDialog

import React, { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Wifi, Info } from 'lucide-react'
import type {
  CloudAccountApiClient,
  CloudAccountConnection,
  CloudProviderType,
  CreateCloudAccountRequest,
  TestCloudAccountResponse,
  UpdateCloudAccountRequest,
} from '@/services/cloudAccountApi'
import {
  CLOUD_PROVIDER_SCHEMAS,
  getAuthMethodSchema,
  getCloudProviderSchemaList,
} from '../cloudProviderSchemas'
import type { CloudFieldDefinition } from '../cloudProviderSchemas'

interface CloudAccountDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  api: CloudAccountApiClient
  existing?: CloudAccountConnection | null
  /** Preselects a provider when creating (e.g. opened from a provider card's "Configure" button). */
  initialProvider?: CloudProviderType
}

const providerSchemaList = getCloudProviderSchemaList()

const CloudAccountDialog: React.FC<CloudAccountDialogProps> = ({
  open,
  onClose,
  onSaved,
  api,
  existing,
  initialProvider,
}) => {
  const isEditing = !!existing

  const [provider, setProvider] = useState<CloudProviderType>('aws')
  const [authMethod, setAuthMethod] = useState<string>('')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestCloudAccountResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const providerSchema = CLOUD_PROVIDER_SCHEMAS[provider]
  const authSchema = getAuthMethodSchema(provider, authMethod) || providerSchema.authMethods[0]

  // Initialize form when the dialog opens, or when the record being edited changes.
  useEffect(() => {
    if (!open) return

    if (existing) {
      const authSchemaForExisting =
        getAuthMethodSchema(existing.provider, existing.authMethod) ||
        CLOUD_PROVIDER_SCHEMAS[existing.provider].authMethods[0]
      setProvider(existing.provider)
      setAuthMethod(authSchemaForExisting.authMethod)
      setName(existing.name)
      setIsDefault(existing.isDefault)
      const cfg: Record<string, string> = {}
      for (const field of authSchemaForExisting.fields) {
        if (field.secret) {
          // Secrets are masked by the server and never round-tripped — start blank.
          cfg[field.name] = ''
        } else {
          const val = existing.config[field.name]
          cfg[field.name] = typeof val === 'string' ? val : val != null ? String(val) : ''
        }
      }
      setConfig(cfg)
    } else {
      const initial = initialProvider ? CLOUD_PROVIDER_SCHEMAS[initialProvider] : providerSchemaList[0]
      const initialAuthSchema = initial.authMethods[0]
      setProvider(initial.provider)
      setAuthMethod(initialAuthSchema.authMethod)
      setName('')
      setIsDefault(false)
      const cfg: Record<string, string> = {}
      for (const field of initialAuthSchema.fields) {
        cfg[field.name] = ''
      }
      setConfig(cfg)
    }
    setTestResult(null)
    setError(null)
  }, [open, existing, initialProvider])

  // When the provider changes during creation, reset to that provider's first auth method.
  const handleProviderChange = (next: CloudProviderType) => {
    const nextSchema = CLOUD_PROVIDER_SCHEMAS[next]
    const nextAuthSchema = nextSchema.authMethods[0]
    setProvider(next)
    setAuthMethod(nextAuthSchema.authMethod)
    const cfg: Record<string, string> = {}
    for (const field of nextAuthSchema.fields) {
      cfg[field.name] = ''
    }
    setConfig(cfg)
  }

  // When the auth method changes during creation, reset the config fields for that method.
  const handleAuthMethodChange = (next: string) => {
    const nextAuthSchema = getAuthMethodSchema(provider, next)
    setAuthMethod(next)
    const cfg: Record<string, string> = {}
    for (const field of nextAuthSchema?.fields || []) {
      cfg[field.name] = ''
    }
    setConfig(cfg)
  }

  const handleConfigChange = (fieldName: string, value: string) => {
    setConfig((prev) => ({ ...prev, [fieldName]: value }))
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      // Only send fields with a value — blank secret fields mean "keep existing" on edit,
      // and blank optional fields are simply omitted.
      const cleanConfig: Record<string, unknown> = {}
      for (const field of authSchema.fields) {
        const val = config[field.name]
        if (val !== undefined && val !== '') {
          cleanConfig[field.name] = val
        }
      }

      if (isEditing && existing) {
        const updateData: UpdateCloudAccountRequest = { name, config: cleanConfig, isDefault }
        await api.update(existing.id, updateData)
      } else {
        const createData: CreateCloudAccountRequest = {
          provider,
          authMethod,
          name,
          config: cleanConfig,
          isDefault,
        }
        await api.create(createData)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save cloud account')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!existing) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.test(existing.id)
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!open) return null

  const requiredFields = authSchema.fields.filter((f) => f.required)
  const hasRequiredValues = requiredFields.every((f) => {
    // A required secret left blank while editing means "keep the existing value" — that's valid.
    if (f.secret && isEditing) return true
    const val = config[f.name]
    return !!val && val.trim() !== ''
  })
  const canSave = name.trim() !== '' && hasRequiredValues

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{providerSchema.icon}</span>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isEditing ? 'Edit' : 'Add'} Cloud Account
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{providerSchema.shortDescription}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Provider select */}
          <div>
            <label htmlFor="cloud-account-provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cloud Provider <span className="text-red-500">*</span>
            </label>
            {isEditing ? (
              <div className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-750 text-gray-700 dark:text-gray-300">
                {providerSchema.icon} {providerSchema.displayName}
              </div>
            ) : (
              <select
                id="cloud-account-provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as CloudProviderType)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {providerSchemaList.map((schema) => (
                  <option key={schema.provider} value={schema.provider}>
                    {schema.icon} {schema.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Auth method select */}
          <div>
            <label htmlFor="cloud-account-auth-method" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Authentication Method <span className="text-red-500">*</span>
            </label>
            {isEditing ? (
              <div className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-750 text-gray-700 dark:text-gray-300">
                {authSchema.displayName}
              </div>
            ) : (
              <select
                id="cloud-account-auth-method"
                value={authMethod}
                onChange={(e) => handleAuthMethodChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {providerSchema.authMethods.map((m) => (
                  <option key={m.authMethod} value={m.authMethod}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{authSchema.description}</p>
          </div>

          {/* Setup hint */}
          {authSchema.hint && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{authSchema.hint}</p>
            </div>
          )}

          {/* Name field */}
          <div>
            <label htmlFor="cloud-account-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              id="cloud-account-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder={`e.g. Production ${providerSchema.displayName}`}
            />
          </div>

          {/* Dynamic config fields */}
          {authSchema.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={config[field.name] || ''}
              isEditing={isEditing}
              onChange={(val) => handleConfigChange(field.name, val)}
            />
          ))}

          {/* Default toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            Set as default {providerSchema.displayName} account
          </label>

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
  field: CloudFieldDefinition
  value: string
  isEditing: boolean
  onChange: (value: string) => void
}> = ({ field, value, isEditing, onChange }) => {
  const fieldId = `cloud-account-field-${field.name}`
  const labelEl = (
    <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
      {field.secret && (
        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium align-middle">
          Secret
        </span>
      )}
    </label>
  )

  const helpEl = field.helpText ? (
    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{field.helpText}</p>
  ) : null

  const placeholder = field.secret && isEditing ? 'Leave blank to keep existing value' : field.placeholder

  const baseClasses =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500'

  if (field.type === 'textarea') {
    return (
      <div>
        {labelEl}
        <textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
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
          id={fieldId}
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
        id={fieldId}
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={baseClasses}
        autoComplete={field.type === 'password' ? 'new-password' : 'off'}
      />
      {helpEl}
    </div>
  )
}

export default CloudAccountDialog

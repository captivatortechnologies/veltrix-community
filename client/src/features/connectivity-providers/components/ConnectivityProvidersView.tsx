import React, { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Star,
  Trash2,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Plus,
} from 'lucide-react'
import type { ConnectivityProvider, ProviderType } from '@/services/connectivityProviderApi'
import { connectivityProviderApi } from '@/services/connectivityProviderApi'
import { useConfirmDialog } from '@/components/shared/ConfirmationDialog'
import { useToast } from '@/components/shared/Toast'
import {
  PROVIDER_SCHEMAS,
  PROVIDER_CATEGORIES,
  getProviderSchemaList,
} from '../providerSchemas'
import type { ProviderSchema, ProviderCategory } from '../providerSchemas'
import ProviderConfigDialog from './ProviderConfigDialog'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  CONNECTED: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: 'text-emerald-600 dark:text-emerald-400',
    label: 'Connected',
  },
  CONFIGURED: {
    icon: <Wifi className="w-3.5 h-3.5" />,
    color: 'text-blue-600 dark:text-blue-400',
    label: 'Configured',
  },
  ERROR: {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    color: 'text-red-600 dark:text-red-400',
    label: 'Error',
  },
  UNCONFIGURED: {
    icon: <WifiOff className="w-3.5 h-3.5" />,
    color: 'text-gray-400 dark:text-gray-500',
    label: 'Not configured',
  },
}

// ---------------------------------------------------------------------------
// ProviderInstanceRow — a single configured instance within a provider card
// ---------------------------------------------------------------------------

interface ProviderInstanceRowProps {
  provider: ConnectivityProvider
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onTest: () => void
  testing: boolean
}

const ProviderInstanceRow: React.FC<ProviderInstanceRowProps> = ({
  provider,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  testing,
}) => {
  const status = provider.status || 'UNCONFIGURED'
  const st = statusConfig[status] || statusConfig.UNCONFIGURED

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-750 rounded-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex items-center gap-1 text-xs ${st.color}`}>
          {st.icon}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{provider.name}</span>
        {provider.isDefault && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium whitespace-nowrap">
            <Star className="w-2.5 h-2.5" /> Default
          </span>
        )}
        {provider.lastTestedAt && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            Tested {new Date(provider.lastTestedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onTest}
          disabled={testing}
          className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
          title="Test connection"
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
        </button>
        {!provider.isDefault && (
          <button
            onClick={onSetDefault}
            className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition-colors"
            title="Set as default"
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          title="Edit configuration"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          title="Remove configuration"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProviderCard — shows a provider type with all its configured instances
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  schema: ProviderSchema
  providers: ConnectivityProvider[]
  onConfigure: () => void
  onEdit: (provider: ConnectivityProvider) => void
  onDelete: (provider: ConnectivityProvider) => void
  onSetDefault: (provider: ConnectivityProvider) => void
  onTest: (provider: ConnectivityProvider) => void
  testingId: string | null
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  schema,
  providers,
  onConfigure,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  testingId,
}) => {
  const hasInstances = providers.length > 0

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center text-xl">
            {schema.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{schema.displayName}</h3>
              {hasInstances && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                  {providers.length} configured
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{schema.shortDescription}</p>
          </div>
        </div>
        {!hasInstances && (
          <span className={`flex items-center gap-1 text-xs ${statusConfig.UNCONFIGURED.color}`}>
            {statusConfig.UNCONFIGURED.icon} {statusConfig.UNCONFIGURED.label}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{schema.description}</p>

      {/* Configured instances */}
      {hasInstances && (
        <div className="space-y-1.5">
          {providers.map((p) => (
            <ProviderInstanceRow
              key={p.id}
              provider={p}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
              onSetDefault={() => onSetDefault(p)}
              onTest={() => onTest(p)}
              testing={testingId === p.id}
            />
          ))}
        </div>
      )}

      {/* Error messages */}
      {providers
        .filter((p) => p.status === 'ERROR' && p.statusMessage)
        .map((p) => (
          <p key={p.id} className="text-xs text-red-600 dark:text-red-400 truncate">
            {p.name}: {p.statusMessage}
          </p>
        ))}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          PROVIDER_CATEGORIES[schema.category]
            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
        }`}>
          {PROVIDER_CATEGORIES[schema.category]?.label || schema.category}
        </span>

        <button
          onClick={onConfigure}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
        >
          {hasInstances ? (
            <>
              <Plus className="w-3.5 h-3.5" />
              Add Another
            </>
          ) : (
            'Configure'
          )}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConnectivityProvidersView — main shared component
// ---------------------------------------------------------------------------

const ConnectivityProvidersView: React.FC = () => {
  const { confirm } = useConfirmDialog()
  const toast = useToast()
  const [providers, setProviders] = useState<ConnectivityProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogSchema, setDialogSchema] = useState<ProviderSchema | null>(null)
  const [dialogExisting, setDialogExisting] = useState<ConnectivityProvider | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await connectivityProviderApi.list()
      setProviders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  // Group providers by providerType — supports multiple per type
  const providersByType = new Map<ProviderType, ConnectivityProvider[]>()
  for (const p of providers) {
    const type = p.providerType as ProviderType
    const list = providersByType.get(type) || []
    list.push(p)
    providersByType.set(type, list)
  }

  const handleConfigure = (schema: ProviderSchema) => {
    setDialogSchema(schema)
    setDialogExisting(null)
    setDialogOpen(true)
  }

  const handleEdit = (schema: ProviderSchema, provider: ConnectivityProvider) => {
    setDialogSchema(schema)
    setDialogExisting(provider)
    setDialogOpen(true)
  }

  const handleDelete = async (provider: ConnectivityProvider) => {
    const schema = PROVIDER_SCHEMAS[provider.providerType as ProviderType]
    const confirmed = await confirm({
      title: 'Remove Provider',
      message: `Are you sure you want to remove the "${provider.name}" (${schema?.displayName || provider.providerType}) configuration? This cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      await connectivityProviderApi.delete(provider.id)
      await fetchProviders()
    } catch (err) {
      console.error('Failed to delete provider:', err)
    }
  }

  const handleSetDefault = async (provider: ConnectivityProvider) => {
    try {
      await connectivityProviderApi.setDefault(provider.id)
      await fetchProviders()
    } catch (err) {
      console.error('Failed to set default:', err)
    }
  }

  const handleTest = async (provider: ConnectivityProvider) => {
    setTestingId(provider.id)
    try {
      const result = await connectivityProviderApi.testConnection(provider.id)
      await fetchProviders() // Refresh to get updated status
      // Surface the outcome — otherwise a quick silent refetch looks like nothing
      // happened whether the test passed or failed.
      if (result.success) {
        toast.success(result.message || `${provider.name} is reachable.`)
      } else {
        toast.error(result.message || `${provider.name} connection test failed.`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to test ${provider.name}.`)
    } finally {
      setTestingId(null)
    }
  }

  const handleDialogSaved = async () => {
    setDialogOpen(false)
    await fetchProviders()
  }

  const configuredCount = providers.length

  // Group schemas by category
  const schemaList = getProviderSchemaList()
  const groupedSchemas = new Map<ProviderCategory, ProviderSchema[]>()
  for (const s of schemaList) {
    const list = groupedSchemas.get(s.category) || []
    list.push(s)
    groupedSchemas.set(s.category, list)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Remote Connectivity</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure how the platform authenticates and accesses your remote infrastructure.
            {configuredCount > 0 && <> &middot; {configuredCount} provider{configuredCount !== 1 ? 's' : ''} configured</>}
          </p>
        </div>
        <button
          onClick={fetchProviders}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
        </div>
      ) : (
        /* Provider cards grouped by category */
        Array.from(groupedSchemas.entries()).map(([category, schemas]) => (
          <div key={category}>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {PROVIDER_CATEGORIES[category].label}
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {PROVIDER_CATEGORIES[category].description}
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {schemas.map((schema) => (
                <ProviderCard
                  key={schema.providerType}
                  schema={schema}
                  providers={providersByType.get(schema.providerType) || []}
                  onConfigure={() => handleConfigure(schema)}
                  onEdit={(p) => handleEdit(schema, p)}
                  onDelete={(p) => handleDelete(p)}
                  onSetDefault={(p) => handleSetDefault(p)}
                  onTest={(p) => handleTest(p)}
                  testingId={testingId}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Config dialog */}
      {dialogSchema && (
        <ProviderConfigDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={handleDialogSaved}
          schema={dialogSchema}
          existing={dialogExisting}
        />
      )}
    </div>
  )
}

export default ConnectivityProvidersView

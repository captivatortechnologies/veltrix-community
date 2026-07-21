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
import type { TicketingConnection, TicketingProviderId } from '@/services/ticketingProviderApi'
import { ticketingProviderApi } from '@/services/ticketingProviderApi'
import { useConfirmDialog } from '@/components/shared/ConfirmationDialog'
import { useToast } from '@/components/shared/Toast'
import { getTicketingProviderSchemaList } from '../ticketingProviderSchemas'
import type { TicketingProviderSchema } from '../ticketingProviderSchemas'
import ProviderConfigDialog from './ProviderConfigDialog'

// ---------------------------------------------------------------------------
// Status helpers (identical presentation to ConnectivityProvidersView)
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
// ConnectionRow — a single configured connection within a provider card
// ---------------------------------------------------------------------------

interface ConnectionRowProps {
  connection: TicketingConnection
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onTest: () => void
  testing: boolean
}

const ConnectionRow: React.FC<ConnectionRowProps> = ({
  connection,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  testing,
}) => {
  const status = connection.status || 'UNCONFIGURED'
  const st = statusConfig[status] || statusConfig.UNCONFIGURED

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-750 rounded-md">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex items-center gap-1 text-xs ${st.color}`}>
          {st.icon}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{connection.name}</span>
        {connection.isDefault && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium whitespace-nowrap">
            <Star className="w-2.5 h-2.5" /> Default
          </span>
        )}
        {connection.lastTestedAt && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            Tested {new Date(connection.lastTestedAt).toLocaleDateString()}
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
        {!connection.isDefault && (
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
// ProviderCard — shows a provider with all its configured connections
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  schema: TicketingProviderSchema
  connections: TicketingConnection[]
  onConfigure: () => void
  onEdit: (connection: TicketingConnection) => void
  onDelete: (connection: TicketingConnection) => void
  onSetDefault: (connection: TicketingConnection) => void
  onTest: (connection: TicketingConnection) => void
  testingId: string | null
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  schema,
  connections,
  onConfigure,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  testingId,
}) => {
  const hasInstances = connections.length > 0

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
                  {connections.length} configured
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

      {/* Configured connections */}
      {hasInstances && (
        <div className="space-y-1.5">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              connection={c}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c)}
              onSetDefault={() => onSetDefault(c)}
              onTest={() => onTest(c)}
              testing={testingId === c.id}
            />
          ))}
        </div>
      )}

      {/* Error messages */}
      {connections
        .filter((c) => c.status === 'ERROR' && c.statusMessage)
        .map((c) => (
          <p key={c.id} className="text-xs text-red-600 dark:text-red-400 truncate">
            {c.name}: {c.statusMessage}
          </p>
        ))}

      {/* Footer */}
      <div className="flex items-center justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
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
// TicketingProvidersView — main shared component
// ---------------------------------------------------------------------------

const TICKETING_SCHEMA_LIST = getTicketingProviderSchemaList()

const TicketingProvidersView: React.FC = () => {
  const { confirm } = useConfirmDialog()
  const toast = useToast()
  const [connections, setConnections] = useState<TicketingConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogSchema, setDialogSchema] = useState<TicketingProviderSchema | null>(null)
  const [dialogExisting, setDialogExisting] = useState<TicketingConnection | null>(null)

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await ticketingProviderApi.list()
      setConnections(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticketing connections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConnections()
  }, [fetchConnections])

  // Group connections by provider — supports multiple per provider.
  const connectionsByProvider = new Map<TicketingProviderId, TicketingConnection[]>()
  for (const c of connections) {
    const provider = c.provider
    const list = connectionsByProvider.get(provider) || []
    list.push(c)
    connectionsByProvider.set(provider, list)
  }

  const handleConfigure = (schema: TicketingProviderSchema) => {
    setDialogSchema(schema)
    setDialogExisting(null)
    setDialogOpen(true)
  }

  const handleEdit = (schema: TicketingProviderSchema, connection: TicketingConnection) => {
    setDialogSchema(schema)
    setDialogExisting(connection)
    setDialogOpen(true)
  }

  const handleDelete = async (connection: TicketingConnection) => {
    const schema = TICKETING_SCHEMA_LIST.find((s) => s.provider === connection.provider)
    const confirmed = await confirm({
      title: 'Remove Ticketing Connection',
      message: `Are you sure you want to remove the "${connection.name}" (${schema?.displayName || connection.provider}) connection? This cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      await ticketingProviderApi.delete(connection.id)
      toast.success(`"${connection.name}" removed.`)
      await fetchConnections()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove connection')
    }
  }

  const handleSetDefault = async (connection: TicketingConnection) => {
    try {
      await ticketingProviderApi.setDefault(connection.id)
      toast.success(`"${connection.name}" is now the default.`)
      await fetchConnections()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set default')
    }
  }

  const handleTest = async (connection: TicketingConnection) => {
    setTestingId(connection.id)
    try {
      const result = await ticketingProviderApi.testConnection(connection.id)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
      await fetchConnections() // Refresh to get updated status
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test connection failed')
    } finally {
      setTestingId(null)
    }
  }

  const handleDialogSaved = async () => {
    setDialogOpen(false)
    toast.success(dialogExisting ? 'Connection updated.' : 'Connection created.')
    await fetchConnections()
  }

  const configuredCount = connections.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Ticketing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configure the change/issue-tracking systems used to link and manage tickets against your
            configurations.
            {configuredCount > 0 && <> &middot; {configuredCount} connection{configuredCount !== 1 ? 's' : ''} configured</>}
          </p>
        </div>
        <button
          onClick={() => void fetchConnections()}
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {TICKETING_SCHEMA_LIST.map((schema) => (
            <ProviderCard
              key={schema.provider}
              schema={schema}
              connections={connectionsByProvider.get(schema.provider) || []}
              onConfigure={() => handleConfigure(schema)}
              onEdit={(c) => handleEdit(schema, c)}
              onDelete={(c) => handleDelete(c)}
              onSetDefault={(c) => handleSetDefault(c)}
              onTest={(c) => handleTest(c)}
              testingId={testingId}
            />
          ))}
        </div>
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

export default TicketingProvidersView

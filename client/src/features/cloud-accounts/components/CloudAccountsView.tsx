import React, { useCallback, useEffect, useState } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
  Star,
  Trash2,
  Settings,
  RefreshCw,
  Wifi,
  Plus,
} from 'lucide-react'
import type { CloudAccountApiClient, CloudAccountConnection, CloudProviderType } from '@/services/cloudAccountApi'
import { useConfirmDialog } from '@/components/shared/ConfirmationDialog'
import { CLOUD_PROVIDER_SCHEMAS, getAuthMethodSchema, getCloudProviderSchemaList } from '../cloudProviderSchemas'
import type { CloudProviderSchema } from '../cloudProviderSchemas'
import CloudAccountDialog from './CloudAccountDialog'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { icon: React.ReactNode; badgeClass: string; label: string }> = {
  VERIFIED: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    label: 'Verified',
  },
  ERROR: {
    icon: <AlertCircle className="w-3 h-3" />,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    label: 'Error',
  },
  UNVERIFIED: {
    icon: <Circle className="w-3 h-3" />,
    badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    label: 'Unverified',
  },
}

const getStatusInfo = (status: string) => statusConfig[status] || statusConfig.UNVERIFIED

const StatusBadge: React.FC<{ status: string; title?: string }> = ({ status, title }) => {
  const st = getStatusInfo(status)
  return (
    <span
      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${st.badgeClass}`}
      title={title}
    >
      {st.icon}
      {st.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// AccountRow — a single configured cloud account within a provider card
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: CloudAccountConnection
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  onTest: () => void
  testing: boolean
}

const AccountRow: React.FC<AccountRowProps> = ({ account, onEdit, onDelete, onSetDefault, onTest, testing }) => {
  const authSchema = getAuthMethodSchema(account.provider, account.authMethod)

  return (
    <div
      className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-750 rounded-md"
      data-testid={`cloud-account-row-${account.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge status={account.status} title={account.statusMessage || undefined} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{account.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
          {authSchema?.displayName || account.authMethod}
        </span>
        {account.isDefault && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium whitespace-nowrap">
            <Star className="w-2.5 h-2.5" /> Default
          </span>
        )}
        {account.lastTestedAt && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            Tested {new Date(account.lastTestedAt).toLocaleDateString()}
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
        {!account.isDefault && (
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
          title="Remove account"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProviderCard — shows a cloud provider with all its registered accounts
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  schema: CloudProviderSchema
  accounts: CloudAccountConnection[]
  onConfigure: () => void
  onEdit: (account: CloudAccountConnection) => void
  onDelete: (account: CloudAccountConnection) => void
  onSetDefault: (account: CloudAccountConnection) => void
  onTest: (account: CloudAccountConnection) => void
  testingId: string | null
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  schema,
  accounts,
  onConfigure,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
  testingId,
}) => {
  const hasAccounts = accounts.length > 0

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
      data-testid={`cloud-provider-card-${schema.provider}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 flex items-center justify-center text-xl">
            {schema.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">{schema.displayName}</h3>
              {hasAccounts && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                  {accounts.length} configured
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{schema.shortDescription}</p>
          </div>
        </div>
        {!hasAccounts && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            <Circle className="w-3 h-3" /> Not configured
          </span>
        )}
      </div>

      {/* Registered accounts */}
      {hasAccounts && (
        <div className="space-y-1.5">
          {accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              onEdit={() => onEdit(a)}
              onDelete={() => onDelete(a)}
              onSetDefault={() => onSetDefault(a)}
              onTest={() => onTest(a)}
              testing={testingId === a.id}
            />
          ))}
        </div>
      )}

      {/* Error messages */}
      {accounts
        .filter((a) => a.status === 'ERROR' && a.statusMessage)
        .map((a) => (
          <p key={a.id} className="text-xs text-red-600 dark:text-red-400 truncate">
            {a.name}: {a.statusMessage}
          </p>
        ))}

      {/* Footer */}
      <div className="flex items-center justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={onConfigure}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
        >
          {hasAccounts ? (
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
// CloudAccountsView — parameterized by API client. (Upstream also reused
// this component for a platform-operator "Veltrix-managed accounts" page;
// that page lived only in the excluded hosted-commercial platform-admin
// portal. `tenantCloudAccountApi` is the only client this now backs.)
// ---------------------------------------------------------------------------

export interface CloudAccountsViewProps {
  api: CloudAccountApiClient
  /** Overrides the default heading, in case a future caller needs different copy. */
  title?: string
  description?: string
}

const CloudAccountsView: React.FC<CloudAccountsViewProps> = ({
  api,
  title = 'Cloud Accounts',
  description = 'Connect your cloud provider accounts so Veltrix can provision and manage infrastructure on your behalf.',
}) => {
  const { confirm } = useConfirmDialog()
  const [accounts, setAccounts] = useState<CloudAccountConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogExisting, setDialogExisting] = useState<CloudAccountConnection | null>(null)
  const [dialogInitialProvider, setDialogInitialProvider] = useState<CloudProviderType | undefined>(undefined)

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.list()
      setAccounts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cloud accounts')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Group accounts by provider — supports multiple accounts per provider.
  const accountsByProvider = new Map<CloudProviderType, CloudAccountConnection[]>()
  for (const a of accounts) {
    const list = accountsByProvider.get(a.provider) || []
    list.push(a)
    accountsByProvider.set(a.provider, list)
  }

  const handleAddAccount = () => {
    setDialogExisting(null)
    setDialogInitialProvider(undefined)
    setDialogOpen(true)
  }

  const handleConfigure = (schema: CloudProviderSchema) => {
    setDialogExisting(null)
    setDialogInitialProvider(schema.provider)
    setDialogOpen(true)
  }

  const handleEdit = (account: CloudAccountConnection) => {
    setDialogExisting(account)
    setDialogInitialProvider(undefined)
    setDialogOpen(true)
  }

  const handleDelete = async (account: CloudAccountConnection) => {
    const schema = CLOUD_PROVIDER_SCHEMAS[account.provider]
    const confirmed = await confirm({
      title: 'Remove Cloud Account',
      message: `Are you sure you want to remove the "${account.name}" (${schema?.displayName || account.provider}) account? This cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    try {
      await api.remove(account.id)
      await fetchAccounts()
    } catch (err) {
      console.error('Failed to delete cloud account:', err)
    }
  }

  const handleSetDefault = async (account: CloudAccountConnection) => {
    try {
      await api.update(account.id, { isDefault: true })
      await fetchAccounts()
    } catch (err) {
      console.error('Failed to set default cloud account:', err)
    }
  }

  const handleTest = async (account: CloudAccountConnection) => {
    setTestingId(account.id)
    try {
      await api.test(account.id)
      await fetchAccounts() // Refresh to get updated status
    } catch (err) {
      console.error('Test connection failed:', err)
    } finally {
      setTestingId(null)
    }
  }

  const handleDialogSaved = async () => {
    setDialogOpen(false)
    await fetchAccounts()
  }

  const configuredCount = accounts.length
  const schemaList = getCloudProviderSchemaList()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {description}
            {configuredCount > 0 && <> &middot; {configuredCount} account{configuredCount !== 1 ? 's' : ''} configured</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAccounts}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleAddAccount}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add cloud account
          </button>
        </div>
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
          {schemaList.map((schema) => (
            <ProviderCard
              key={schema.provider}
              schema={schema}
              accounts={accountsByProvider.get(schema.provider) || []}
              onConfigure={() => handleConfigure(schema)}
              onEdit={(a) => handleEdit(a)}
              onDelete={(a) => handleDelete(a)}
              onSetDefault={(a) => handleSetDefault(a)}
              onTest={(a) => handleTest(a)}
              testingId={testingId}
            />
          ))}
        </div>
      )}

      {/* Config dialog */}
      <CloudAccountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleDialogSaved}
        api={api}
        existing={dialogExisting}
        initialProvider={dialogInitialProvider}
      />
    </div>
  )
}

export default CloudAccountsView

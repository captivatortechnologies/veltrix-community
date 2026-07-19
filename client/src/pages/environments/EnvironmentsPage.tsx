import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Layers, Plus, Pencil, SlidersHorizontal, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Select } from '@/components/shared/Select'
import { Checkbox } from '@/components/shared/Checkbox'
import { Badge } from '@/components/shared/Badge'
import { FormDialog } from '@/components/shared/FormDialog'
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable'
import { useToast } from '@/components/shared/Toast'
import { useConfirmDialog } from '@/components/shared/ConfirmationDialog'
import {
  environmentsApi,
  type EnvironmentRecord,
  type EnvironmentPolicy,
  type OwnerOption,
  type DeploymentStrategy,
} from './environmentsApi'
import { getRoles, type Role } from '@/services/roleService'

const STRATEGY_OPTIONS: { value: DeploymentStrategy; label: string }[] = [
  { value: 'DIRECT', label: 'Direct (dev/test only)' },
  { value: 'CANARY', label: 'Canary (progressive %)' },
  { value: 'BLUE_GREEN', label: 'Blue / Green' },
  { value: 'ROLLING', label: 'Rolling' },
]

function ownerLabel(owner: OwnerOption | EnvironmentRecord['owner']): string {
  if (!owner) return '—'
  return owner.name || owner.email
}

const PolicySummary: React.FC<{ policy: EnvironmentPolicy | null }> = ({ policy }) => {
  if (!policy || !policy.requireApproval) {
    return <Badge variant="success">Auto-deploy</Badge>
  }
  return (
    <Badge variant="warning">
      Approval required · {policy.minApprovers} approver{policy.minApprovers === 1 ? '' : 's'}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Create / Edit dialog (name + owner)
// ---------------------------------------------------------------------------

interface EnvironmentFormDialogProps {
  isOpen: boolean
  mode: 'create' | 'edit'
  initial?: EnvironmentRecord | null
  owners: OwnerOption[]
  onClose: () => void
  onSaved: () => void
}

const EnvironmentFormDialog: React.FC<EnvironmentFormDialogProps> = ({
  isOpen,
  mode,
  initial,
  owners,
  onClose,
  onSaved,
}) => {
  const toast = useToast()
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name ?? '')
      setOwnerId(initial?.ownerId ?? '')
      setError(null)
    }
  }, [isOpen, initial])

  const ownerOptions = useMemo(
    () => [
      { value: '', label: 'No owner' },
      ...owners.map((u) => ({ value: u.id, label: ownerLabel(u) })),
    ],
    [owners],
  )

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Environment name is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create') {
        await environmentsApi.create({ name: name.trim(), ownerId: ownerId || null })
        toast.success(`Environment "${name.trim()}" created`)
      } else if (initial) {
        await environmentsApi.update(initial.id, { name: name.trim(), ownerId: ownerId || null })
        toast.success('Environment updated')
      }
      onSaved()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? 'New environment' : 'Edit environment'}
      description={
        mode === 'create'
          ? 'Environments group deployments across your pipeline (e.g. dev, staging, prod).'
          : undefined
      }
      submitText={mode === 'create' ? 'Create' : 'Save'}
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      error={error}
    >
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. production"
        autoFocus
      />
      <Select
        label="Owner"
        value={ownerId}
        onChange={setOwnerId}
        options={ownerOptions}
        placeholder="No owner"
      />
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Controls editor (EnvironmentPolicy)
// ---------------------------------------------------------------------------

interface ControlsEditorDialogProps {
  isOpen: boolean
  environment: EnvironmentRecord | null
  environments: EnvironmentRecord[]
  onClose: () => void
  onSaved: () => void
}

const ControlsEditorDialog: React.FC<ControlsEditorDialogProps> = ({
  isOpen,
  environment,
  environments,
  onClose,
  onSaved,
}) => {
  const toast = useToast()
  const [requireApproval, setRequireApproval] = useState(true)
  const [minApprovers, setMinApprovers] = useState('1')
  // Required approver roles are chosen from the tenant's RBAC roles (by name).
  const [roles, setRoles] = useState<Role[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [strategy, setStrategy] = useState<DeploymentStrategy>('ROLLING')
  const [canaryText, setCanaryText] = useState('10, 25, 50, 100')
  const [autoRollback, setAutoRollback] = useState(true)
  const [errorRate, setErrorRate] = useState('5')
  const [healthTimeout, setHealthTimeout] = useState('300')
  const [requirePrev, setRequirePrev] = useState(false)
  const [prevEnvId, setPrevEnvId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && environment?.policy) {
      const p = environment.policy
      setRequireApproval(p.requireApproval)
      setMinApprovers(String(p.minApprovers))
      setSelectedRoles(p.requiredApproverRoles)
      setStrategy(p.deploymentStrategy)
      setCanaryText(p.canarySteps.join(', '))
      setAutoRollback(p.autoRollbackOnError)
      setErrorRate(String(p.errorRateThreshold))
      setHealthTimeout(String(p.healthCheckTimeout))
      setRequirePrev(p.requirePreviousEnv)
      setPrevEnvId(p.previousEnvTagId ?? '')
      setError(null)
    } else if (isOpen) {
      setSelectedRoles([])
    }
  }, [isOpen, environment])

  // Load the tenant's RBAC roles for the approver-roles picker when opened.
  useEffect(() => {
    if (!isOpen) return
    setRolesLoading(true)
    setRolesError(null)
    getRoles()
      .then((r) => setRoles(r))
      .catch((e) => setRolesError(e instanceof Error ? e.message : 'Failed to load roles'))
      .finally(() => setRolesLoading(false))
  }, [isOpen])

  const prevEnvOptions = useMemo(
    () => [
      { value: '', label: 'Select an environment…' },
      ...environments
        .filter((e) => e.id !== environment?.id)
        .map((e) => ({ value: e.id, label: e.name })),
    ],
    [environments, environment],
  )

  const parseList = (text: string): number[] =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n))

  // Show a checkbox per RBAC role, plus any already-saved role name that no
  // longer matches a current role (so stale selections stay visible/removable).
  const roleOptions = useMemo(() => {
    const names = new Set<string>(roles.map((r) => r.name))
    selectedRoles.forEach((n) => names.add(n))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [roles, selectedRoles])

  const toggleRole = (name: string, checked: boolean) =>
    setSelectedRoles((prev) => (checked ? [...new Set([...prev, name])] : prev.filter((r) => r !== name)))

  const handleSubmit = async () => {
    if (!environment) return
    setSubmitting(true)
    setError(null)
    try {
      const saved = await environmentsApi.savePolicy(environment.id, {
        requireApproval,
        minApprovers: Number(minApprovers) || 0,
        requiredApproverRoles: selectedRoles,
        deploymentStrategy: strategy,
        canarySteps: parseList(canaryText),
        autoRollbackOnError: autoRollback,
        errorRateThreshold: Number(errorRate) || 0,
        healthCheckTimeout: Number(healthTimeout) || 0,
        requirePreviousEnv: requirePrev,
        previousEnvTagId: requirePrev ? prevEnvId || null : null,
      })
      void saved
      toast.success('Controls saved')
      onSaved()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save controls'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Controls · ${environment?.name ?? ''}`}
      description="Deployment approval and rollout policy for this environment."
      submitText="Save controls"
      size="lg"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      error={error}
    >
      <Checkbox
        label="Require approval before deploying"
        checked={requireApproval}
        onChange={(e) => setRequireApproval(e.target.checked)}
      />
      {requireApproval && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Minimum approvers"
            type="number"
            min={0}
            value={minApprovers}
            onChange={(e) => setMinApprovers(e.target.value)}
          />
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Required approver roles
            </span>
            {rolesLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading roles…</p>
            ) : rolesError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {rolesError}
              </p>
            ) : roleOptions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No roles defined. Create roles under Access Control.
              </p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                {roleOptions.map((name) => (
                  <Checkbox
                    key={name}
                    label={roles.some((r) => r.name === name) ? name : `${name} (removed)`}
                    checked={selectedRoles.includes(name)}
                    onChange={(e) => toggleRole(name, e.target.checked)}
                  />
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Approvers must hold at least one selected role. Leave all unchecked for any role.
            </p>
          </div>
        </div>
      )}

      <Select
        label="Deployment strategy"
        value={strategy}
        onChange={(v) => setStrategy(v as DeploymentStrategy)}
        options={STRATEGY_OPTIONS}
      />

      {strategy === 'CANARY' && (
        <Input
          label="Canary steps"
          value={canaryText}
          onChange={(e) => setCanaryText(e.target.value)}
          placeholder="10, 25, 50, 100"
          helperText="Ascending traffic percentages (1–100)"
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Health check timeout (s)"
          type="number"
          min={0}
          value={healthTimeout}
          onChange={(e) => setHealthTimeout(e.target.value)}
        />
        <Input
          label="Error rate threshold (%)"
          type="number"
          min={0}
          value={errorRate}
          onChange={(e) => setErrorRate(e.target.value)}
        />
      </div>

      <Checkbox
        label="Auto-rollback on error"
        checked={autoRollback}
        onChange={(e) => setAutoRollback(e.target.checked)}
      />

      <Checkbox
        label="Require a previous environment to pass first"
        checked={requirePrev}
        onChange={(e) => setRequirePrev(e.target.checked)}
      />
      {requirePrev && (
        <Select
          label="Previous environment"
          value={prevEnvId}
          onChange={setPrevEnvId}
          options={prevEnvOptions}
          placeholder="Select an environment…"
        />
      )}
    </FormDialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EnvironmentsPage: React.FC = () => {
  const toast = useToast()
  const { confirm } = useConfirmDialog()

  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EnvironmentRecord | null>(null)
  const [controlsTarget, setControlsTarget] = useState<EnvironmentRecord | null>(null)

  const loadEnvironments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await environmentsApi.list()
      setEnvironments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load environments')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOwners = useCallback(async () => {
    try {
      const users = await environmentsApi.listUsers()
      setOwners(users)
    } catch {
      // Owner list is optional; the picker just falls back to "No owner".
      setOwners([])
    }
  }, [])

  useEffect(() => {
    loadEnvironments()
    loadOwners()
  }, [loadEnvironments, loadOwners])

  const handleDelete = useCallback(
    async (env: EnvironmentRecord) => {
      const ok = await confirm({
        title: `Delete "${env.name}"?`,
        message: 'This removes the environment and its tag associations. Deployments block deletion.',
        confirmText: 'Delete',
        variant: 'danger',
      })
      if (!ok) return
      try {
        await environmentsApi.remove(env.id)
        toast.success(`Environment "${env.name}" deleted`)
        loadEnvironments()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete environment')
      }
    },
    [confirm, toast, loadEnvironments],
  )

  const columns: DataTableColumn<EnvironmentRecord>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Environment',
        render: (env) => (
          <span className="font-medium text-content-primary">{env.name}</span>
        ),
      },
      {
        key: 'owner',
        header: 'Owner',
        render: (env) => (
          <span className="text-content-secondary">{ownerLabel(env.owner)}</span>
        ),
      },
      {
        key: 'policy',
        header: 'Controls',
        render: (env) => (
          <div className="flex items-center gap-2">
            <PolicySummary policy={env.policy} />
            <span className="text-xs text-content-tertiary">{env.policy?.deploymentStrategy}</span>
          </div>
        ),
      },
      {
        key: 'deploymentCount',
        header: 'Deployments',
        align: 'right',
        render: (env) => (
          <span className="tabular-nums text-content-secondary">{env.deploymentCount}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-7 w-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Environments</h1>
            <p className="text-sm text-content-secondary">
              Manage environments, ownership, and deployment controls
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={loadEnvironments} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New environment
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-foreground"
        >
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={environments}
        rowKey={(env) => env.id}
        isLoading={loading}
        emptyState={{
          icon: <Layers className="h-8 w-8 text-content-tertiary" aria-hidden="true" />,
          title: 'No environments yet',
          description: 'Create your first environment to start deploying across your pipeline.',
          action: (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              New environment
            </Button>
          ),
        }}
        rowActions={(env) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditTarget(env)}
              leftIcon={<Pencil className="h-4 w-4" />}
              aria-label={`Edit ${env.name}`}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setControlsTarget(env)}
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              aria-label={`Controls for ${env.name}`}
            >
              Controls
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(env)}
              leftIcon={<Trash2 className="h-4 w-4" />}
              aria-label={`Delete ${env.name}`}
            >
              Delete
            </Button>
          </div>
        )}
      />

      <EnvironmentFormDialog
        isOpen={createOpen}
        mode="create"
        owners={owners}
        onClose={() => setCreateOpen(false)}
        onSaved={loadEnvironments}
      />

      <EnvironmentFormDialog
        isOpen={editTarget !== null}
        mode="edit"
        initial={editTarget}
        owners={owners}
        onClose={() => setEditTarget(null)}
        onSaved={loadEnvironments}
      />

      <ControlsEditorDialog
        isOpen={controlsTarget !== null}
        environment={controlsTarget}
        environments={environments}
        onClose={() => setControlsTarget(null)}
        onSaved={loadEnvironments}
      />
    </div>
  )
}

export default EnvironmentsPage

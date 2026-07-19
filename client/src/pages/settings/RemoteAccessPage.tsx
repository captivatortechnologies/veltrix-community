import React, { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Server, Trash2, Ban, Plus } from 'lucide-react'
import { Card, CardBody, CardHeader } from '../../components/shared/Card'
import { Button } from '../../components/shared/Button'
import { Badge } from '../../components/shared/Badge'
import { Alert } from '../../components/shared/Alert'
import { Input } from '../../components/shared/Input'
import { DataTable, type DataTableColumn } from '../../components/shared/DataTable'
import { useToast } from '../../components/shared/Toast'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { tenantZtnaApi, type ZtnaDevice, type ZtnaEnrollment, type ZtnaEnrollResult } from '../../services/ztnaApi'
import { EnrollResultDialog } from '../../features/ztna/EnrollResultDialog'

const QK = {
  status: ['ztna', 'status'],
  devices: ['ztna', 'devices'],
  enrollments: ['ztna', 'enrollments'],
} as const

const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : '—')

/**
 * Settings › Remote Access (Veltrix-managed ZTNA).
 *
 * Lets a tenant link its own servers to the Veltrix Tailscale network with a
 * one-command install. Distinct from Settings › Connectivity, which is for
 * bring-your-own ZTNA providers. Devices land isolated to this tenant by tag.
 */
const RemoteAccessPage: React.FC = () => {
  const toast = useToast()
  const { confirm } = useConfirmDialog()
  const queryClient = useQueryClient()

  const [label, setLabel] = useState('')
  const [enrollResult, setEnrollResult] = useState<ZtnaEnrollResult | null>(null)

  const statusQuery = useQuery({ queryKey: QK.status, queryFn: tenantZtnaApi.status })
  const configured = statusQuery.data?.configured === true

  const devicesQuery = useQuery({ queryKey: QK.devices, queryFn: tenantZtnaApi.listDevices, enabled: configured })
  const enrollmentsQuery = useQuery({
    queryKey: QK.enrollments,
    queryFn: tenantZtnaApi.listEnrollments,
    enabled: configured,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ztna'] })

  const enrollMutation = useMutation({
    mutationFn: () => tenantZtnaApi.enroll(label || undefined),
    onSuccess: (result) => {
      setEnrollResult(result)
      setLabel('')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => tenantZtnaApi.revokeEnrollment(id),
    onSuccess: () => {
      toast.success('Enrollment revoked')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteDeviceMutation = useMutation({
    mutationFn: (id: string) => tenantZtnaApi.deleteDevice(id),
    onSuccess: () => {
      toast.success('Device removed')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deviceColumns: DataTableColumn<ZtnaDevice>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Server',
        render: (d) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-content-primary">{d.hostname || d.name}</div>
            <div className="truncate text-xs text-content-tertiary">{d.addresses[0] ?? '—'}</div>
          </div>
        ),
      },
      { key: 'os', header: 'OS', render: (d) => d.os || '—' },
      {
        key: 'status',
        header: 'Status',
        render: (d) =>
          d.online ? <Badge variant="success" dot>Online</Badge> : <Badge variant="secondary" dot>Offline</Badge>,
      },
      { key: 'lastSeen', header: 'Last seen', render: (d) => fmt(d.lastSeen) },
    ],
    []
  )

  const enrollmentColumns: DataTableColumn<ZtnaEnrollment>[] = useMemo(
    () => [
      { key: 'label', header: 'Label', render: (e) => e.label || '—' },
      {
        key: 'status',
        header: 'Status',
        render: (e) => {
          const variant =
            e.status === 'ACTIVE' ? 'success' : e.status === 'REVOKED' ? 'danger' : e.status === 'EXPIRED' ? 'secondary' : 'warning'
          return <Badge variant={variant}>{e.status}</Badge>
        },
      },
      { key: 'createdAt', header: 'Created', render: (e) => fmt(e.createdAt) },
      { key: 'expiresAt', header: 'Expires', render: (e) => fmt(e.expiresAt) },
    ],
    []
  )

  const askThenRemove = async (d: ZtnaDevice) => {
    const ok = await confirm({
      title: 'Remove server',
      message: `Remove "${d.hostname || d.name}" from the Veltrix network? It will lose remote connectivity until re-enrolled.`,
      confirmText: 'Remove',
      variant: 'danger',
    })
    if (ok) deleteDeviceMutation.mutate(d.id)
  }

  const askThenRevoke = async (e: ZtnaEnrollment) => {
    const ok = await confirm({
      title: 'Revoke enrollment',
      message: 'Revoke this enrollment key? A server that has not yet joined with it will be unable to.',
      confirmText: 'Revoke',
      variant: 'danger',
    })
    if (ok) revokeMutation.mutate(e.id)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary">Remote Access</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Link your servers to the Veltrix secure network with a single command. Each server is
          isolated to your organization — no other tenant can reach it.
        </p>
      </div>

      {statusQuery.isLoading && <p className="text-content-secondary">Loading…</p>}

      {statusQuery.data && !configured && (
        <Alert variant="info" title="Remote Access is not available">
          Your Veltrix administrator has not enabled managed remote access yet. Please contact
          support to turn it on for your organization.
        </Alert>
      )}

      {configured && (
        <>
          <Card variant="bordered" className="mb-6">
            <CardHeader>
              <h2 className="font-semibold text-content-primary">Link a server</h2>
            </CardHeader>
            <CardBody>
              <p className="mb-4 text-sm text-content-secondary">
                Generate a one-time install command, then run it on the Linux server you want to
                connect.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <label className="mb-1 block text-sm font-medium text-content-secondary" htmlFor="ztna-label">
                    Server label (optional)
                  </label>
                  <Input
                    id="ztna-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="prod-web-01"
                    maxLength={100}
                  />
                </div>
                <Button
                  variant="primary"
                  leftIcon={<Plus className="h-4 w-4" />}
                  isLoading={enrollMutation.isPending}
                  onClick={() => enrollMutation.mutate()}
                >
                  Link a server
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card variant="bordered" className="mb-6">
            <CardHeader>
              <h2 className="font-semibold text-content-primary">Your servers</h2>
            </CardHeader>
            <CardBody>
              <DataTable<ZtnaDevice>
                columns={deviceColumns}
                data={devicesQuery.data ?? []}
                rowKey={(d) => d.id}
                isLoading={devicesQuery.isLoading}
                emptyState={{
                  icon: <Server className="h-6 w-6" />,
                  title: 'No servers linked yet',
                  description: 'Use “Link a server” above to connect your first server.',
                }}
                rowActions={(d) => (
                  <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => askThenRemove(d)}>
                    Remove
                  </Button>
                )}
              />
            </CardBody>
          </Card>

          <Card variant="bordered">
            <CardHeader>
              <h2 className="font-semibold text-content-primary">Enrollments</h2>
            </CardHeader>
            <CardBody>
              <DataTable<ZtnaEnrollment>
                columns={enrollmentColumns}
                data={enrollmentsQuery.data ?? []}
                rowKey={(e) => e.id}
                isLoading={enrollmentsQuery.isLoading}
                emptyState={{ title: 'No enrollments', description: 'Install commands you generate are listed here.' }}
                rowActions={(e) =>
                  e.status === 'PENDING' || e.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" leftIcon={<Ban className="h-4 w-4" />} onClick={() => askThenRevoke(e)}>
                      Revoke
                    </Button>
                  ) : null
                }
              />
            </CardBody>
          </Card>
        </>
      )}

      <EnrollResultDialog result={enrollResult} onClose={() => setEnrollResult(null)} />
    </div>
  )
}

export default RemoteAccessPage

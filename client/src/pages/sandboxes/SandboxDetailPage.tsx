import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { Card, CardBody } from '../../components/shared/Card'
import { EmptyState } from '../../components/shared/EmptyState'
import { Skeleton } from '../../components/shared/Skeleton'
import { useConfirmDialog } from '../../components/shared/ConfirmationDialog'
import { useToast } from '../../components/shared/Toast'
import { sandboxApi, type SandboxDetail, type SandboxFile } from '../../services/sandboxApi'
import { SandboxDetailHeader } from './components/SandboxDetailHeader'
import { SandboxManifestCard } from './components/SandboxManifestCard'
import { SandboxEditorCard } from './components/SandboxEditorCard'
import { SandboxRunPanel } from './components/SandboxRunPanel'
import { SandboxPreviewCard } from './components/SandboxPreviewCard'
import { generateClientId } from './editor.utils'

/** Coalesces a burst of sandbox:file-changed events (e.g. the CLI syncing many files at
 * once) into a single refresh instead of one fetch per event. */
const FILE_CHANGE_REFRESH_DEBOUNCE_MS = 400

const FILES_PAGE_SIZE = 500

/** Loading skeleton shown while the initial sandbox fetch is in flight. */
const DetailSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="space-y-3">
      <Skeleton variant="text" width={140} />
      <Skeleton variant="text" width={280} height={28} />
      <Skeleton variant="text" width={360} />
    </div>
    <Card variant="bordered">
      <CardBody>
        <div className="space-y-3">
          <Skeleton variant="rectangular" height={20} width="60%" />
          <Skeleton variant="rectangular" height={60} />
        </div>
      </CardBody>
    </Card>
    <Card variant="bordered">
      <CardBody>
        <Skeleton variant="rectangular" height={140} />
      </CardBody>
    </Card>
  </div>
)

const SandboxDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { confirm } = useConfirmDialog()
  const toast = useToast()

  const [sandbox, setSandbox] = useState<SandboxDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [files, setFiles] = useState<SandboxFile[]>([])
  const [filesTotalCount, setFilesTotalCount] = useState(0)
  const [filesTotalBytes, setFilesTotalBytes] = useState(0)
  const [filesLoading, setFilesLoading] = useState(true)
  const [loadingMoreFiles, setLoadingMoreFiles] = useState(false)

  const loadSandbox = useCallback(
    async (options: { showSpinner?: boolean } = {}) => {
      if (!id) return
      if (options.showSpinner) setRefreshing(true)
      try {
        const detail = await sandboxApi.get(id)
        setSandbox(detail)
        setNotFound(false)
      } catch (error) {
        setNotFound(true)
        toast.error(error instanceof Error ? error.message : 'Failed to load sandbox')
      } finally {
        setLoading(false)
        if (options.showSpinner) setRefreshing(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  const loadFiles = useCallback(
    async (offset: number) => {
      if (!id) return
      if (offset === 0) setFilesLoading(true)
      else setLoadingMoreFiles(true)
      try {
        const page = await sandboxApi.getFiles(id, { limit: FILES_PAGE_SIZE, offset })
        setFiles((prev) => (offset === 0 ? page.files : [...prev, ...page.files]))
        setFilesTotalCount(page.totalCount)
        setFilesTotalBytes(page.totalBytes)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load sandbox files')
      } finally {
        setFilesLoading(false)
        setLoadingMoreFiles(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )

  useEffect(() => {
    loadSandbox()
    loadFiles(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRefresh = async () => {
    await Promise.all([loadSandbox({ showSpinner: true }), loadFiles(0)])
  }

  // One id per page-session for every write the editor makes; the server echoes it on the
  // resulting sandbox:file-changed event so this browser tab can ignore its own edits
  // (see 01_plan.md §"Loop prevention & conflicts").
  const [originClientId] = useState(() => generateClientId())

  // The editor's own realtime subscription calls this after every mutation it observes
  // (its own saves/deletes, and any remote sandbox:file-changed for this tenant) — debounced
  // so a CLI sync touching many files at once triggers one refresh, not one per file.
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const handleMutated = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    refreshTimeoutRef.current = setTimeout(() => {
      loadSandbox()
      loadFiles(0)
    }, FILE_CHANGE_REFRESH_DEBOUNCE_MS)
  }, [loadSandbox, loadFiles])

  useEffect(
    () => () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current)
    },
    [],
  )

  const handleDelete = async () => {
    if (!sandbox) return
    const confirmed = await confirm({
      title: 'Delete sandbox',
      message: `Delete the sandbox "${sandbox.name}" and all of its synced files? Your local files are not affected — you can recreate the sandbox with the Veltrix CLI at any time.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      await sandboxApi.delete(sandbox.id)
      toast.success(`Sandbox "${sandbox.name}" deleted`)
      navigate('/sandboxes')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete sandbox')
      setDeleting(false)
    }
  }

  if (!id) {
    return <Navigate to="/sandboxes" />
  }

  if (loading) {
    return <DetailSkeleton />
  }

  if (notFound || !sandbox) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={<FlaskConical size={48} aria-hidden="true" />}
            title="Sandbox not found"
            description="It may have been deleted, or you may not have access to it."
            action={
              <a
                href="/sandboxes"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/sandboxes')
                }}
                className="text-primary hover:underline text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Back to Sandboxes
              </a>
            }
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <SandboxDetailHeader
        sandbox={sandbox}
        onDelete={handleDelete}
        deleting={deleting}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onCopied={() => toast.success('Dev command copied to clipboard')}
      />

      <SandboxManifestCard
        manifest={sandbox.manifest}
        sandboxId={sandbox.id}
        originClientId={originClientId}
        onConfigTypeAdded={handleMutated}
      />

      <SandboxEditorCard
        sandboxId={sandbox.id}
        originClientId={originClientId}
        files={files}
        totalCount={filesTotalCount}
        totalBytes={filesTotalBytes}
        filesLoading={filesLoading}
        hasMoreFiles={files.length < filesTotalCount}
        loadingMoreFiles={loadingMoreFiles}
        onLoadMoreFiles={() => loadFiles(files.length)}
        onMutated={handleMutated}
      />

      <SandboxRunPanel
        sandboxId={sandbox.id}
        sandboxStatus={sandbox.status}
        configTypes={sandbox.manifest?.configTypes ?? []}
      />

      <SandboxPreviewCard sandbox={sandbox} />
    </div>
  )
}

export default SandboxDetailPage

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FileCode,
  Save,
  Trash2,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../../components/shared/Card'
import { Button } from '../../../components/shared/Button'
import { Badge } from '../../../components/shared/Badge'
import { EmptyState } from '../../../components/shared/EmptyState'
import { Skeleton } from '../../../components/shared/Skeleton'
import { Tooltip } from '../../../components/shared/Tooltip'
import { useToast } from '../../../components/shared/Toast'
import { useConfirmDialog } from '../../../components/shared/ConfirmationDialog'
import {
  sandboxApi,
  SandboxApiError,
  type SandboxFile,
  type SandboxFileContent,
  type SandboxFileChangedPayload,
  type SyncValidationResult,
} from '../../../services/sandboxApi'
import { useSandboxEvents } from '../../../contexts/RealtimeContext'
import { useTheme } from '../../../contexts/ThemeContext'
import { SandboxFileList } from './SandboxFilesCard'
import { formatSize, shortSha } from '../sandbox.format'
import { getFileKind, FILE_KIND_LABELS } from '../editor.utils'

// CodeMirror (+ language packages) is only fetched once a developer opens a file — keeps it
// out of the main bundle chunk entirely.
const CodeMirrorPane = React.lazy(() => import('./CodeMirrorPane'))

export interface SandboxEditorCardProps {
  sandboxId: string
  originClientId: string
  files: SandboxFile[]
  totalCount: number
  totalBytes: number
  filesLoading: boolean
  hasMoreFiles: boolean
  loadingMoreFiles: boolean
  onLoadMoreFiles: () => void
  /** Fired after a save/delete, or a remote sandbox:file-changed event, so the parent can
   * refresh the file list + manifest summary (validity may have changed). */
  onMutated: () => void
}

interface LastSaved {
  validation: SyncValidationResult
  at: number
}

/** Why the CodeMirror pane is non-editable for the currently loaded file. */
function readOnlyReason(content: SandboxFileContent | null): string | null {
  if (!content) return null
  if (content.encoding === 'base64') return 'Binary file — shown read-only.'
  if (content.truncated) return 'File exceeds the 256 KB preview cap — shown read-only (truncated).'
  return null
}

/**
 * The in-browser code editor: a file picker (SandboxFileList in interactive mode) paired
 * with a CodeMirror pane. Handles load/dirty/save (button + Cmd/Ctrl-S), optimistic-
 * concurrency conflicts (409 on save, or a live remote edit while dirty), post-save
 * validation, delete, and live-reload of the open file when it's clean.
 */
export const SandboxEditorCard: React.FC<SandboxEditorCardProps> = ({
  sandboxId,
  originClientId,
  files,
  totalCount,
  totalBytes,
  filesLoading,
  hasMoreFiles,
  loadingMoreFiles,
  onLoadMoreFiles,
  onMutated,
}) => {
  const toast = useToast()
  const { confirm } = useConfirmDialog()
  const { isDarkMode } = useTheme()
  const { subscribe } = useSandboxEvents(sandboxId)

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<SandboxFileContent | null>(null)
  const [draft, setDraft] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null)

  const dirty = fileContent !== null && draft !== fileContent.content
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const loadFile = useCallback(
    async (path: string, options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoadingFile(true)
      setFileError(null)
      try {
        const content = await sandboxApi.getFile(sandboxId, path)
        setFileContent(content)
        setDraft(content.content)
        setConflict(false)
        setLastSaved(null)
      } catch (error) {
        setFileContent(null)
        setFileError(error instanceof Error ? error.message : 'Failed to load file')
      } finally {
        if (!options.silent) setLoadingFile(false)
      }
    },
    [sandboxId],
  )

  const handleSelectFile = useCallback(
    async (file: SandboxFile) => {
      if (file.path === selectedPath) return
      if (dirty) {
        const proceed = await confirm({
          title: 'Discard unsaved changes?',
          message: `You have unsaved edits in "${selectedPath}". Opening another file will discard them.`,
          confirmText: 'Discard and switch',
          cancelText: 'Keep editing',
          variant: 'warning',
        })
        if (!proceed) return
      }
      setSelectedPath(file.path)
      await loadFile(file.path)
    },
    [selectedPath, dirty, confirm, loadFile],
  )

  const performSave = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!fileContent || !selectedPath) return
      setSaving(true)
      try {
        const res = await sandboxApi.putFile(sandboxId, {
          path: selectedPath,
          content: draft,
          encoding: 'utf8',
          expectedSha256: options.force ? undefined : fileContent.sha256,
          originClientId,
        })
        setFileContent((prev) => (prev ? { ...prev, sha256: res.sha256, size: res.size, content: draft } : prev))
        setLastSaved({ validation: res.validation, at: Date.now() })
        setConflict(false)
        toast.success(`Saved ${selectedPath}`)
        onMutated()
      } catch (error) {
        if (error instanceof SandboxApiError && error.status === 409) {
          setConflict(true)
        } else {
          toast.error(error instanceof Error ? error.message : 'Failed to save file')
        }
      } finally {
        setSaving(false)
      }
    },
    [fileContent, selectedPath, draft, sandboxId, originClientId, toast, onMutated],
  )

  const handleReloadFromSandbox = useCallback(async () => {
    if (!selectedPath) return
    await loadFile(selectedPath)
  }, [selectedPath, loadFile])

  const handleDelete = useCallback(async () => {
    if (!selectedPath) return
    const confirmed = await confirm({
      title: 'Delete file',
      message: `Delete "${selectedPath}" from the sandbox? This also removes any transpiled artifact. Your local copy is unaffected until the CLI's next sync.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await sandboxApi.deleteFile(sandboxId, selectedPath, originClientId)
      toast.success(`Deleted ${selectedPath}`)
      setSelectedPath(null)
      setFileContent(null)
      setConflict(false)
      onMutated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete file')
    } finally {
      setDeleting(false)
    }
  }, [sandboxId, selectedPath, originClientId, confirm, toast, onMutated])

  // Live updates: reload silently when the open file is clean, otherwise raise the same
  // conflict banner a stale save produces. Ignore our own writes (originClientId echo) and
  // always bubble the event up so the parent can refresh the file list/manifest.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== 'sandbox:file-changed') return
      const payload = event.payload as unknown as SandboxFileChangedPayload
      if (payload.originClientId && payload.originClientId === originClientId) return

      onMutated()

      if (!selectedPath || payload.path !== selectedPath) return

      if (dirtyRef.current) {
        setConflict(true)
        return
      }

      if (payload.sha256 === '') {
        setSelectedPath(null)
        setFileContent(null)
        toast.info(`${payload.path} was deleted from your local workspace`)
        return
      }

      loadFile(payload.path, { silent: true })
      toast.info('Updated from your local workspace')
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, selectedPath, originClientId])

  const dirtyPaths = useMemo(
    () => (dirty && selectedPath ? new Set([selectedPath]) : new Set<string>()),
    [dirty, selectedPath],
  )

  const kind = selectedPath ? getFileKind(selectedPath) : 'plain'
  const readOnly = readOnlyReason(fileContent) !== null
  const canSave = Boolean(selectedPath) && dirty && !saving && !readOnly

  return (
    <Card variant="bordered">
      <CardHeader
        actions={
          totalCount > 0 ? (
            <span className="text-sm text-content-secondary">
              {totalCount.toLocaleString()} file{totalCount === 1 ? '' : 's'} · {formatSize(totalBytes)}
            </span>
          ) : undefined
        }
      >
        <h2 className="text-base font-semibold text-content-primary flex items-center gap-2">
          <FileCode size={18} className="text-primary" aria-hidden="true" />
          Code editor
        </h2>
      </CardHeader>
      <CardBody>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="md:w-80 shrink-0">
            <SandboxFileList
              files={files}
              totalCount={totalCount}
              loading={filesLoading}
              hasMore={hasMoreFiles}
              loadingMore={loadingMoreFiles}
              onLoadMore={onLoadMoreFiles}
              selectedPath={selectedPath}
              onSelectFile={handleSelectFile}
              dirtyPaths={dirtyPaths}
              listLabel="Files — select to edit"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            {!selectedPath ? (
              totalCount > 0 ? (
                <EmptyState
                  icon={<FileCode size={40} aria-hidden="true" />}
                  title="Select a file to edit"
                  description="Choose a file from the list to view and edit it here."
                />
              ) : null
            ) : loadingFile ? (
              <div className="space-y-2" role="status" aria-label={`Loading ${selectedPath}`}>
                <Skeleton variant="text" width={220} />
                <Skeleton variant="rectangular" height={480} />
              </div>
            ) : fileError ? (
              <div
                className="rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-foreground flex items-start gap-2"
                role="alert"
              >
                <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="flex-1">{fileError}</span>
                <Button variant="secondary" size="sm" onClick={() => loadFile(selectedPath)}>
                  Retry
                </Button>
              </div>
            ) : fileContent ? (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-content-primary truncate flex items-center gap-2 flex-wrap">
                      {selectedPath}
                      {dirty && (
                        <Badge variant="warning" size="sm">
                          Unsaved
                        </Badge>
                      )}
                      {readOnly && (
                        <Badge variant="secondary" size="sm">
                          <Lock size={10} className="mr-1" aria-hidden="true" />
                          Read-only
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-content-tertiary">
                      {FILE_KIND_LABELS[kind]} · {formatSize(fileContent.size)} · sha256{' '}
                      <span className="font-mono">{shortSha(fileContent.sha256)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Tooltip content="Delete this file">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${selectedPath}`}
                        onClick={handleDelete}
                        isLoading={deleting}
                        leftIcon={<Trash2 size={14} className="text-danger" aria-hidden="true" />}
                      />
                    </Tooltip>
                    <Tooltip content="Ctrl/Cmd + S">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => performSave()}
                        disabled={!canSave}
                        isLoading={saving}
                        leftIcon={<Save size={14} aria-hidden="true" />}
                      >
                        Save
                      </Button>
                    </Tooltip>
                  </div>
                </div>

                {readOnly && (
                  <p className="text-xs text-content-tertiary flex items-center gap-1.5">
                    <Lock size={12} aria-hidden="true" />
                    {readOnlyReason(fileContent)}
                  </p>
                )}

                {conflict && (
                  <div
                    role="alert"
                    className="rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2.5 text-sm text-warning-subtle-foreground flex flex-wrap items-start gap-3"
                  >
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-[16rem]">
                      <p className="font-medium">This file changed in the sandbox since you opened it.</p>
                      <p className="mt-0.5 text-xs opacity-90">
                        Reload to see the latest version, or overwrite it with your current edits.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReloadFromSandbox}
                        leftIcon={<RotateCcw size={14} aria-hidden="true" />}
                      >
                        Reload from sandbox
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => performSave({ force: true })} isLoading={saving}>
                        Overwrite
                      </Button>
                    </div>
                  </div>
                )}

                {lastSaved && (
                  <div
                    role="status"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      lastSaved.validation.valid
                        ? 'border-success-subtle bg-success-subtle text-success-subtle-foreground'
                        : 'border-danger-subtle bg-danger-subtle text-danger-subtle-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {lastSaved.validation.valid ? (
                        <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle size={14} className="shrink-0" aria-hidden="true" />
                      )}
                      {lastSaved.validation.valid
                        ? 'Saved — sandbox is valid'
                        : `Saved — ${lastSaved.validation.errors.length} error${
                            lastSaved.validation.errors.length === 1 ? '' : 's'
                          } after this change`}
                    </div>
                    {(lastSaved.validation.errors.length > 0 || lastSaved.validation.warnings.length > 0) && (
                      <ul className="mt-1.5 space-y-1 text-xs text-content-primary">
                        {lastSaved.validation.errors.map((err, i) => (
                          <li key={`e-${i}`} className="flex items-start gap-1.5">
                            <XCircle size={12} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                            {err}
                          </li>
                        ))}
                        {lastSaved.validation.warnings.map((warn, i) => (
                          <li key={`w-${i}`} className="flex items-start gap-1.5">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                            {warn}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <Suspense fallback={<Skeleton variant="rectangular" height={480} />}>
                  <CodeMirrorPane
                    value={draft}
                    onChange={setDraft}
                    kind={kind}
                    dark={isDarkMode}
                    readOnly={readOnly}
                    onSave={readOnly ? undefined : () => performSave()}
                    ariaLabel={`Editing ${selectedPath}`}
                  />
                </Suspense>
              </>
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

export default SandboxEditorCard

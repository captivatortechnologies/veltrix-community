import React, { useMemo, useState } from 'react'
import { Files, Search } from 'lucide-react'
import { Card, CardHeader, CardBody } from '../../../components/shared/Card'
import { Input } from '../../../components/shared/Input'
import { Button } from '../../../components/shared/Button'
import { EmptyState } from '../../../components/shared/EmptyState'
import type { SandboxFile } from '../../../services/sandboxApi'
import { formatSize, shortSha } from '../sandbox.format'

/** Split "config-types/indexes/validate.ts" into { dir: "config-types/indexes", base:
 * "validate.ts" } so interactive rows can lead with the (usually more distinguishing)
 * filename instead of every row's shared directory prefix eating the truncation budget. */
function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? { dir: '', base: path } : { dir: path.slice(0, idx), base: path.slice(idx + 1) }
}

export interface SandboxFileListProps {
  files: SandboxFile[]
  totalCount: number
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /**
   * Interactive ("open in editor") mode — when `onSelectFile` is provided, rows become
   * keyboard-operable buttons instead of static text, with the currently open file
   * highlighted and a dirty dot for files with unsaved edits. Omit both for a purely
   * informational listing.
   */
  selectedPath?: string | null
  onSelectFile?: (file: SandboxFile) => void
  dirtyPaths?: ReadonlySet<string>
  /** Overrides the default "No files synced yet" empty state (e.g. the editor's tighter copy). */
  emptyState?: React.ReactNode
  /** aria-label for the file listbox/list; defaults to "Synced files". */
  listLabel?: string
}

/**
 * Searchable, cap-scrolled list of a sandbox's synced files — the shared building block
 * behind both the read-only `SandboxFilesCard` and the editor's interactive file picker
 * (SandboxEditorCard). Kept dependency-free of anything editor-specific so it stays cheap
 * to render in both places.
 */
export const SandboxFileList: React.FC<SandboxFileListProps> = ({
  files,
  totalCount,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  selectedPath = null,
  onSelectFile,
  dirtyPaths,
  emptyState,
  listLabel = 'Synced files',
}) => {
  const [search, setSearch] = useState('')
  const interactive = Boolean(onSelectFile)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return files
    return files.filter((f) => f.path.toLowerCase().includes(query))
  }, [files, search])

  if (loading) {
    return <p className="text-sm text-content-tertiary">Loading files…</p>
  }

  if (totalCount === 0) {
    return (
      emptyState ?? (
        <EmptyState
          icon={<Files size={40} aria-hidden="true" />}
          title="No files synced yet"
          description="Once the CLI syncs your app, its files will show up here."
        />
      )
    )
  }

  return (
    <div className="space-y-3">
      <Input
        leftIcon={<Search size={16} aria-hidden="true" />}
        placeholder="Filter by path…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Filter synced files by path"
        inputSize="sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-content-tertiary py-4 text-center">
          No files match &quot;{search}&quot;.
        </p>
      ) : (
        <ul
          className="divide-y divide-border border border-border rounded-md max-h-96 overflow-y-auto"
          aria-label={listLabel}
        >
          {filtered.map((file) => {
            const isSelected = interactive && selectedPath === file.path
            const isDirty = dirtyPaths?.has(file.path)
            const { dir, base } = splitPath(file.path)

            return (
              <li key={file.path}>
                {interactive ? (
                  // Narrower interactive contexts (the editor's file picker) lead with the
                  // filename — usually the more distinguishing part — rather than a full
                  // single-line path, which truncates every row in a directory to the same
                  // shared prefix (e.g. every "config-types/indexes/…" file reading identically).
                  <button
                    type="button"
                    onClick={() => onSelectFile!(file)}
                    aria-current={isSelected ? 'true' : undefined}
                    title={isDirty ? `${file.path} (unsaved changes)` : file.path}
                    className={`
                      w-full text-left px-3 py-2 flex items-start gap-1.5 text-sm min-w-0
                      focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary
                      ${isSelected ? 'bg-primary-subtle' : 'hover:bg-surface-hover'}
                    `}
                  >
                    {isDirty && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-1.5"
                        aria-hidden="true"
                        title="Unsaved changes"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-content-primary truncate block">{base}</span>
                      {dir && (
                        <span className="font-mono text-content-tertiary text-xs truncate block">{dir}/</span>
                      )}
                    </span>
                    <span className="shrink-0 text-content-tertiary text-xs">{formatSize(file.size)}</span>
                  </button>
                ) : (
                  <div className="px-3 py-2 flex items-center justify-between gap-3 text-sm hover:bg-surface-hover">
                    <span className="font-mono text-content-primary truncate" title={file.path}>
                      {file.path}
                    </span>
                    <span className="flex items-center gap-3 shrink-0 text-content-tertiary text-xs">
                      <span className="font-mono" title={`sha256:${file.sha256}`}>
                        {shortSha(file.sha256)}
                      </span>
                      <span className="w-16 text-right">{formatSize(file.size)}</span>
                    </span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {hasMore && !search && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={onLoadMore} isLoading={loadingMore}>
            Load more ({files.length.toLocaleString()} of {totalCount.toLocaleString()})
          </Button>
        </div>
      )}
    </div>
  )
}

export interface SandboxFilesCardProps extends Omit<SandboxFileListProps, 'listLabel'> {
  totalBytes: number
}

/**
 * Read-only "Synced files" overview card: identity/size summary in the header, backed by
 * `SandboxFileList`. The in-browser editor (SandboxEditorCard) renders `SandboxFileList`
 * directly instead, so the two never duplicate a file's path text on the same page.
 */
export const SandboxFilesCard: React.FC<SandboxFilesCardProps> = ({ totalBytes, ...listProps }) => {
  return (
    <Card variant="bordered">
      <CardHeader
        actions={
          listProps.totalCount > 0 ? (
            <span className="text-sm text-content-secondary">
              {listProps.totalCount.toLocaleString()} file{listProps.totalCount === 1 ? '' : 's'} ·{' '}
              {formatSize(totalBytes)}
            </span>
          ) : undefined
        }
      >
        <h2 className="text-base font-semibold text-content-primary flex items-center gap-2">
          <Files size={18} className="text-primary" aria-hidden="true" />
          Synced files
        </h2>
      </CardHeader>
      <CardBody>
        <SandboxFileList {...listProps} />
      </CardBody>
    </Card>
  )
}

export default SandboxFilesCard

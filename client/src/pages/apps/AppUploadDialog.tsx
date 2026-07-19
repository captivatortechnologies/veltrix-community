import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload,
  X,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link2,
} from 'lucide-react'
import { appService } from '../../services/appService'
import type { UploadResult } from '../../services/appService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppUploadDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

type DialogPhase = 'idle' | 'uploading' | 'success' | 'error'
type TabId = 'file' | 'url'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCEPTED_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-tgz',
])

const ACCEPTED_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tgz']

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function isValidFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function isValidPackageUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return 'URL is required'
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'URL must start with https://'
    }
    const pathname = parsed.pathname.toLowerCase()
    const hasValidExt = ACCEPTED_EXTENSIONS.some((ext) => pathname.endsWith(ext))
    if (!hasValidExt) {
      return 'URL must point to a .zip, .tar, or .tar.gz file'
    }
    return null
  } catch {
    return 'Invalid URL format'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AppUploadDialog: React.FC<AppUploadDialogProps> = ({ open, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<TabId>('file')
  const [phase, setPhase] = useState<DialogPhase>('idle')
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  // URL tab state
  const [packageUrl, setPackageUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Reset all state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab('file')
      setPhase('idle')
      setIsDragOver(false)
      setSelectedFile(null)
      setUploadResult(null)
      setErrorMessage(null)
      setFileError(null)
      setPackageUrl('')
      setUrlError(null)
    }
  }, [open])

  // ---- File selection ----

  const handleFileSelect = useCallback((file: File) => {
    setFileError(null)

    if (!isValidFile(file)) {
      setFileError(`Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(', ')}`)
      setSelectedFile(null)
      return
    }

    const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`File is too large. Maximum allowed size is 50 MB.`)
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    setPhase('idle')
    setErrorMessage(null)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileSelect(file)
      e.target.value = ''
    },
    [handleFileSelect]
  )

  // ---- Drag-and-drop ----

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const file = e.dataTransfer.files?.[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  // ---- Upload (file) ----

  const handleUploadFile = useCallback(async () => {
    if (!selectedFile || phase === 'uploading') return

    setPhase('uploading')
    setErrorMessage(null)

    try {
      const result = await appService.uploadApp(selectedFile)
      setUploadResult(result)
      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.')
      setPhase('error')
    }
  }, [selectedFile, phase])

  // ---- Install from URL ----

  const handleInstallFromUrl = useCallback(async () => {
    if (phase === 'uploading') return

    const validationError = isValidPackageUrl(packageUrl)
    if (validationError) {
      setUrlError(validationError)
      return
    }

    setPhase('uploading')
    setErrorMessage(null)
    setUrlError(null)

    try {
      const result = await appService.installFromUrl(packageUrl.trim())
      setUploadResult(result)
      setPhase('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Installation from URL failed. Please try again.')
      setPhase('error')
    }
  }, [packageUrl, phase])

  // ---- Close / success ----

  const handleClose = useCallback(() => {
    if (phase === 'uploading') return
    onClose()
  }, [phase, onClose])

  const handleSuccessDone = useCallback(() => {
    onSuccess()
    onClose()
  }, [onSuccess, onClose])

  // ---- Keyboard: close on Escape ----

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  if (!open) return null

  const isUploading = phase === 'uploading'
  const isSuccess = phase === 'success'
  const isError = phase === 'error'
  const canUploadFile = selectedFile !== null && !isUploading && !isSuccess
  const canInstallUrl = packageUrl.trim().length > 0 && !isUploading && !isSuccess

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-upload-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog card */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl transform transition-all">

          {/* ---- Header ---- */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Upload className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h2
                id="app-upload-dialog-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                Install App Package
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isUploading}
              aria-label="Close dialog"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ---- Body ---- */}
          <div className="px-6 py-5 space-y-5">

            {/* Success state */}
            {isSuccess && uploadResult && (
              <div className="flex flex-col items-center text-center gap-4 py-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    App installed successfully
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {uploadResult.name}
                    </span>{' '}
                    v{uploadResult.version} is now available.
                  </p>
                </div>
                <button
                  onClick={handleSuccessDone}
                  className="mt-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                >
                  Done
                </button>
              </div>
            )}

            {/* Upload / URL form — shown when not yet in success state */}
            {!isSuccess && (
              <>
                {/* Tab switcher */}
                <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <button
                    onClick={() => { setActiveTab('file'); setErrorMessage(null) }}
                    disabled={isUploading}
                    className={[
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      activeTab === 'file'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                      isUploading ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <Upload className="w-4 h-4" />
                    Upload File
                  </button>
                  <button
                    onClick={() => { setActiveTab('url'); setErrorMessage(null) }}
                    disabled={isUploading}
                    className={[
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      activeTab === 'url'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
                      isUploading ? 'cursor-not-allowed opacity-60' : '',
                    ].join(' ')}
                  >
                    <Link2 className="w-4 h-4" />
                    From URL
                  </button>
                </div>

                {/* ---- FILE TAB ---- */}
                {activeTab === 'file' && (
                  <>
                    {/* Drop zone */}
                    <div
                      ref={dropZoneRef}
                      role="button"
                      tabIndex={0}
                      aria-label="Drop zone. Click to select a file or drag and drop here."
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => !isUploading && fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
                          e.preventDefault()
                          fileInputRef.current?.click()
                        }
                      }}
                      className={[
                        'flex flex-col items-center justify-center gap-3 px-6 py-10',
                        'border-2 border-dashed rounded-xl cursor-pointer',
                        'transition-colors duration-150',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900',
                        isUploading
                          ? 'pointer-events-none opacity-60 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40'
                          : isDragOver
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : selectedFile
                          ? 'border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-900/10 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                          : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/10',
                      ].join(' ')}
                    >
                      {selectedFile ? (
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30">
                          <FileArchive className="w-7 h-7 text-purple-600 dark:text-purple-400" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700">
                          <Upload className="w-7 h-7 text-gray-400 dark:text-gray-500" />
                        </div>
                      )}

                      {selectedFile ? (
                        <div className="text-center">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white break-all">
                            {selectedFile.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {formatBytes(selectedFile.size)}
                          </p>
                          <p className="mt-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                            Click to change file
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span className="text-purple-600 dark:text-purple-400">Click to browse</span>
                            {' '}or drag and drop
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Accepted formats: .zip, .tar, .tar.gz
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            Max file size: 50 MB
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/x-tar,application/gzip"
                      onChange={handleInputChange}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    />

                    {/* File validation error */}
                    {fileError && (
                      <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">{fileError}</p>
                      </div>
                    )}
                  </>
                )}

                {/* ---- URL TAB ---- */}
                {activeTab === 'url' && (
                  <>
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="package-url-input"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                        >
                          Package URL
                        </label>
                        <input
                          id="package-url-input"
                          type="url"
                          value={packageUrl}
                          onChange={(e) => { setPackageUrl(e.target.value); setUrlError(null) }}
                          disabled={isUploading}
                          placeholder="https://github.com/org/repo/releases/download/v1.0/my-app.zip"
                          className={[
                            'w-full px-4 py-2.5 text-sm rounded-lg border transition-colors',
                            'bg-white dark:bg-gray-800 text-gray-900 dark:text-white',
                            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                            'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900',
                            'disabled:opacity-60 disabled:cursor-not-allowed',
                            urlError
                              ? 'border-red-300 dark:border-red-600'
                              : 'border-gray-300 dark:border-gray-600',
                          ].join(' ')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canInstallUrl) {
                              e.preventDefault()
                              handleInstallFromUrl()
                            }
                          }}
                        />
                        {urlError && (
                          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{urlError}</p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Enter a direct link to a .zip or .tar.gz app package.
                        The server will download, validate, and install it.
                      </p>
                    </div>
                  </>
                )}

                {/* Upload / install error */}
                {isError && errorMessage && (
                  <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ---- Footer ---- */}
          {!isSuccess && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleClose}
                disabled={isUploading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                Cancel
              </button>

              {activeTab === 'file' && (
                <button
                  onClick={handleUploadFile}
                  disabled={!canUploadFile}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 shadow-sm hover:shadow-md disabled:shadow-none"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              )}

              {activeTab === 'url' && (
                <button
                  onClick={handleInstallFromUrl}
                  disabled={!canInstallUrl}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 shadow-sm hover:shadow-md disabled:shadow-none"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Link2 className="w-4 h-4" />
                      Install from URL
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppUploadDialog

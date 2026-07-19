import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SandboxEditorCard } from '../components/SandboxEditorCard'
import {
  sandboxApi,
  SandboxApiError,
  type SandboxFile,
  type SandboxFileContent,
  type SandboxFileWriteResponse,
  type SandboxFileDeleteResponse,
} from '../../../services/sandboxApi'
import { ToastProvider } from '../../../components/shared/Toast'
import { ConfirmationDialogProvider } from '../../../components/shared/ConfirmationDialog'
import { ThemeProvider } from '../../../contexts/ThemeContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/sandboxApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/sandboxApi')>(
    '../../../services/sandboxApi',
  )
  return {
    ...actual,
    sandboxApi: {
      getFile: vi.fn(),
      putFile: vi.fn(),
      deleteFile: vi.fn(),
    },
  }
})

// A hand-rolled controllable double for useSandboxEvents — lets tests fire
// sandbox:file-changed events synchronously and assert the editor's reaction
// (silent reload vs conflict banner vs echo-guard) without touching sockets.
type RealtimeEvent = { type: string; sandboxId?: string; payload: Record<string, unknown>; receivedAt: number }
type RealtimeHandler = (event: RealtimeEvent) => void
let realtimeHandlers: RealtimeHandler[] = []

vi.mock('../../../contexts/RealtimeContext', () => ({
  useSandboxEvents: () => ({
    connected: true,
    events: [],
    lastEvent: null,
    subscribe: (handler: RealtimeHandler) => {
      realtimeHandlers.push(handler)
      return () => {
        realtimeHandlers = realtimeHandlers.filter((h) => h !== handler)
      }
    },
  }),
}))

function emitFileChanged(payload: Record<string, unknown>) {
  act(() => {
    realtimeHandlers.forEach((handler) =>
      handler({ type: 'sandbox:file-changed', sandboxId: SANDBOX_ID, payload, receivedAt: Date.now() }),
    )
  })
}

// CodeMirror renders into a contenteditable surface jsdom can't fully emulate — stand in
// with a plain textarea that preserves the same value/onChange/readOnly/aria-label/onSave
// contract SandboxEditorCard depends on.
vi.mock('../components/CodeMirrorPane', () => ({
  default: ({
    value,
    onChange,
    readOnly,
    ariaLabel,
    onSave,
  }: {
    value: string
    onChange: (v: string) => void
    readOnly?: boolean
    ariaLabel?: string
    onSave?: () => void
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault()
          onSave?.()
        }
      }}
    />
  ),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SANDBOX_ID = 'sb-1'
const OWN_CLIENT_ID = 'portal-own-session'

const FILE_A: SandboxFile = { path: 'config-types/indexes/validate.ts', sha256: 'a'.repeat(64), size: 100 }
const FILE_B: SandboxFile = { path: 'manifest.yaml', sha256: 'b'.repeat(64), size: 50 }

const CONTENT_A: SandboxFileContent = {
  path: FILE_A.path,
  sha256: 'a'.repeat(64),
  size: 100,
  content: 'export function validate() {}\n',
  encoding: 'utf8',
  truncated: false,
}

const VALID_VALIDATION = { valid: true, errors: [], warnings: [], manifest: null, transpiledCount: 22 }

function renderEditor() {
  const onMutated = vi.fn()
  render(
    <ThemeProvider>
      <ToastProvider>
        <ConfirmationDialogProvider>
          <SandboxEditorCard
            sandboxId={SANDBOX_ID}
            originClientId={OWN_CLIENT_ID}
            files={[FILE_A, FILE_B]}
            totalCount={2}
            totalBytes={150}
            filesLoading={false}
            hasMoreFiles={false}
            loadingMoreFiles={false}
            onLoadMoreFiles={vi.fn()}
            onMutated={onMutated}
          />
        </ConfirmationDialogProvider>
      </ToastProvider>
    </ThemeProvider>,
  )
  return { onMutated }
}

async function openFileA(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle(FILE_A.path))
  return screen.findByLabelText(`Editing ${FILE_A.path}`)
}

describe('SandboxEditorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    realtimeHandlers = []
  })

  // -------------------------------------------------------------------------
  // Load
  // -------------------------------------------------------------------------

  it('loads a file into the editor when selected from the file list', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const user = userEvent.setup()
    renderEditor()

    const textarea = await openFileA(user)

    expect(sandboxApi.getFile).toHaveBeenCalledWith(SANDBOX_ID, FILE_A.path)
    expect(textarea).toHaveValue(CONTENT_A.content)
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('shows a "select a file" hint before any file is opened', () => {
    renderEditor()
    expect(screen.getByText('Select a file to edit')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Dirty + save
  // -------------------------------------------------------------------------

  it('marks the editor dirty on edit and enables Save', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(textarea, 'more code')

    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('saves via the Save button with the loaded sha256 as expectedSha256, and surfaces validation', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const response: SandboxFileWriteResponse = { sha256: 'c'.repeat(64), size: 120, validation: VALID_VALIDATION }
    vi.mocked(sandboxApi.putFile).mockResolvedValue(response)
    const user = userEvent.setup()
    const { onMutated } = renderEditor()
    const textarea = await openFileA(user)

    await user.type(textarea, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(sandboxApi.putFile).toHaveBeenCalledWith(SANDBOX_ID, {
        path: FILE_A.path,
        content: `${CONTENT_A.content}x`,
        encoding: 'utf8',
        expectedSha256: CONTENT_A.sha256,
        originClientId: OWN_CLIENT_ID,
      }),
    )
    expect(await screen.findByText('Saved — sandbox is valid')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    expect(onMutated).toHaveBeenCalled()
  })

  it('saves via Ctrl/Cmd+S', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    vi.mocked(sandboxApi.putFile).mockResolvedValue({
      sha256: 'c'.repeat(64),
      size: 120,
      validation: VALID_VALIDATION,
    })
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)

    await user.type(textarea, 'x')
    await user.keyboard('{Control>}s{/Control}')

    await waitFor(() => expect(sandboxApi.putFile).toHaveBeenCalledTimes(1))
  })

  it('surfaces validation errors after a save that leaves the sandbox invalid', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    vi.mocked(sandboxApi.putFile).mockResolvedValue({
      sha256: 'c'.repeat(64),
      size: 120,
      validation: { valid: false, errors: ['Missing required field: name'], warnings: ['Deprecated key: foo'], manifest: null, transpiledCount: 21 },
    })
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)
    await user.type(textarea, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved — 1 error after this change')).toBeInTheDocument()
    expect(screen.getByText('Missing required field: name')).toBeInTheDocument()
    expect(screen.getByText('Deprecated key: foo')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 409 conflict (on save)
  // -------------------------------------------------------------------------

  it('shows a conflict banner (not a destructive overwrite) on a 409 save response', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    vi.mocked(sandboxApi.putFile).mockRejectedValue(new SandboxApiError('expectedSha256 mismatch', 409))
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)
    await user.type(textarea, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('This file changed in the sandbox since you opened it.')
    expect(screen.getByRole('button', { name: 'Reload from sandbox' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overwrite' })).toBeInTheDocument()
  })

  it('"Reload from sandbox" re-fetches the file and discards the conflict', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValueOnce(CONTENT_A)
    vi.mocked(sandboxApi.putFile).mockRejectedValue(new SandboxApiError('expectedSha256 mismatch', 409))
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)
    await user.type(textarea, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')

    const reloaded: SandboxFileContent = { ...CONTENT_A, sha256: 'd'.repeat(64), content: 'export function validate() { return 1 }\n' }
    vi.mocked(sandboxApi.getFile).mockResolvedValueOnce(reloaded)

    await user.click(screen.getByRole('button', { name: 'Reload from sandbox' }))

    await waitFor(() => expect(sandboxApi.getFile).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await screen.findByLabelText(`Editing ${FILE_A.path}`)).toHaveValue(reloaded.content)
  })

  it('"Overwrite" re-saves without expectedSha256', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    vi.mocked(sandboxApi.putFile)
      .mockRejectedValueOnce(new SandboxApiError('expectedSha256 mismatch', 409))
      .mockResolvedValueOnce({ sha256: 'e'.repeat(64), size: 130, validation: VALID_VALIDATION })
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)
    await user.type(textarea, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Overwrite' }))

    await waitFor(() => expect(sandboxApi.putFile).toHaveBeenCalledTimes(2))
    expect(sandboxApi.putFile).toHaveBeenLastCalledWith(
      SANDBOX_ID,
      expect.objectContaining({ path: FILE_A.path, expectedSha256: undefined }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Live updates
  // -------------------------------------------------------------------------

  it('reloads silently and toasts when a live file-changed event arrives for the open CLEAN file', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValueOnce(CONTENT_A)
    const user = userEvent.setup()
    renderEditor()
    await openFileA(user)

    const updated: SandboxFileContent = { ...CONTENT_A, sha256: 'f'.repeat(64), content: 'export function validate() { return 2 }\n' }
    vi.mocked(sandboxApi.getFile).mockResolvedValueOnce(updated)

    emitFileChanged({
      path: FILE_A.path,
      sha256: updated.sha256,
      previousSha256: CONTENT_A.sha256,
      size: updated.size,
      origin: 'cli',
      originClientId: 'cli-some-other-client',
    })

    await waitFor(() => expect(sandboxApi.getFile).toHaveBeenCalledTimes(2))
    expect(await screen.findByLabelText(`Editing ${FILE_A.path}`)).toHaveValue(updated.content)
    expect(await screen.findByText('Updated from your local workspace')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the conflict banner instead of reloading when a live event arrives while the file is DIRTY', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const user = userEvent.setup()
    renderEditor()
    const textarea = await openFileA(user)
    await user.type(textarea, 'local edit')

    emitFileChanged({
      path: FILE_A.path,
      sha256: 'f'.repeat(64),
      previousSha256: CONTENT_A.sha256,
      size: 10,
      origin: 'cli',
      originClientId: 'cli-some-other-client',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file changed in the sandbox since you opened it.',
    )
    // No silent reload happened — the local draft (with unsaved edits) must survive.
    expect(sandboxApi.getFile).toHaveBeenCalledTimes(1)
    expect(textarea).toHaveValue(`${CONTENT_A.content}local edit`)
  })

  it('ignores a live event carrying its own originClientId (echo guard)', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const user = userEvent.setup()
    const { onMutated } = renderEditor()
    await openFileA(user)
    onMutated.mockClear()

    emitFileChanged({
      path: FILE_A.path,
      sha256: 'f'.repeat(64),
      previousSha256: CONTENT_A.sha256,
      size: 10,
      origin: 'portal',
      originClientId: OWN_CLIENT_ID,
    })

    expect(sandboxApi.getFile).toHaveBeenCalledTimes(1)
    expect(onMutated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Read-only (binary / truncated)
  // -------------------------------------------------------------------------

  it('renders binary content read-only with a clear notice and a disabled Save', async () => {
    const binary: SandboxFileContent = {
      path: FILE_B.path,
      sha256: 'z'.repeat(64),
      size: 999,
      content: 'YmluYXJ5Y29udGVudA==',
      encoding: 'base64',
      truncated: false,
    }
    vi.mocked(sandboxApi.getFile).mockResolvedValue(binary)
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByTitle(FILE_B.path))

    expect(await screen.findByText('Binary file — shown read-only.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByLabelText(`Editing ${FILE_B.path}`)).toHaveAttribute('readonly')
  })

  it('renders truncated text content read-only with a size-cap notice', async () => {
    const truncated: SandboxFileContent = { ...CONTENT_A, truncated: true }
    vi.mocked(sandboxApi.getFile).mockResolvedValue(truncated)
    const user = userEvent.setup()
    renderEditor()
    await openFileA(user)

    expect(
      await screen.findByText('File exceeds the 256 KB preview cap — shown read-only (truncated).'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  it('deletes the open file after confirmation and clears the selection', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const deleteResponse: SandboxFileDeleteResponse = { path: FILE_A.path, deleted: true, validation: VALID_VALIDATION }
    vi.mocked(sandboxApi.deleteFile).mockResolvedValue(deleteResponse)
    const user = userEvent.setup()
    const { onMutated } = renderEditor()
    await openFileA(user)

    await user.click(screen.getByRole('button', { name: `Delete ${FILE_A.path}` }))
    await screen.findByText('Delete file')
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(sandboxApi.deleteFile).toHaveBeenCalledWith(SANDBOX_ID, FILE_A.path, OWN_CLIENT_ID),
    )
    expect(onMutated).toHaveBeenCalled()
    expect(screen.getByText('Select a file to edit')).toBeInTheDocument()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    vi.mocked(sandboxApi.getFile).mockResolvedValue(CONTENT_A)
    const user = userEvent.setup()
    renderEditor()
    await openFileA(user)

    await user.click(screen.getByRole('button', { name: `Delete ${FILE_A.path}` }))
    await screen.findByText('Delete file')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(sandboxApi.deleteFile).not.toHaveBeenCalled()
    expect(screen.getByLabelText(`Editing ${FILE_A.path}`)).toBeInTheDocument()
  })
})

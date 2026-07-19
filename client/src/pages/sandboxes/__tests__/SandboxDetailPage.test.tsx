import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SandboxDetailPage from '../SandboxDetailPage'
import {
  sandboxApi,
  SandboxApiError,
  type SandboxDetail,
  type SandboxFilesPage,
  type RunSandboxResponse,
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
      list: vi.fn(),
      get: vi.fn(),
      getFiles: vi.fn(),
      getFile: vi.fn(),
      putFile: vi.fn(),
      deleteFile: vi.fn(),
      getClientBundleSource: vi.fn(),
      run: vi.fn(),
      delete: vi.fn(),
    },
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = Date.now()
const SANDBOX_ID = 'sb-1'

const baseSandbox = {
  id: SANDBOX_ID,
  customerId: 'cust-1',
  name: 'local-dev',
  appId: 'splunk-enterprise',
  status: 'ACTIVE' as const,
  createdById: 'user-1',
  lastSyncAt: new Date(now - 60_000).toISOString(),
  fileCount: 2,
  sizeBytes: 2048,
  expiresAt: new Date(now + 7 * 86400_000).toISOString(),
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
}

const neverSyncedDetail: SandboxDetail = {
  ...baseSandbox,
  lastSyncAt: null,
  fileCount: 0,
  sizeBytes: 0,
  manifest: null,
}

const populatedDetail: SandboxDetail = {
  ...baseSandbox,
  manifest: {
    appId: 'splunk-enterprise',
    name: 'Splunk Enterprise',
    version: '1.1.0',
    configTypes: [
      { id: 'indexes', name: 'Index Configuration', handlers: ['validate', 'deploy', 'healthCheck', 'getStatus'] },
    ],
    // No client UI declared for this fixture — SandboxPreviewCard.test.tsx covers the
    // populated-client-block preview rendering in isolation.
    client: null,
    valid: true,
    errors: [],
    warnings: [],
    transpiledCount: 22,
  },
}

const emptyFilesPage: SandboxFilesPage = { files: [], totalCount: 0, totalBytes: 0, limit: 500, offset: 0 }

const populatedFilesPage: SandboxFilesPage = {
  files: [
    { path: 'manifest.yaml', sha256: 'a'.repeat(64), size: 1200 },
    { path: 'config-types/indexes/validate.ts', sha256: 'b'.repeat(64), size: 848 },
  ],
  totalCount: 2,
  totalBytes: 2048,
  limit: 500,
  offset: 0,
}

const RUN_RESPONSE: RunSandboxResponse = {
  runId: 'run-1',
  handler: 'validate',
  configTypeId: 'indexes',
  ok: true,
  result: { valid: true, errors: [], warnings: [] },
  error: null,
  timedOut: false,
  durationMs: 42,
  logs: [{ level: 'log', line: 'validating index main' }],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = (initialPath = `/sandboxes/${SANDBOX_ID}`) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmationDialogProvider>
            <Routes>
              <Route path="/sandboxes/:id" element={<SandboxDetailPage />} />
              <Route path="/sandboxes" element={<div>SANDBOXES LIST</div>} />
            </Routes>
          </ConfirmationDialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )

describe('SandboxDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an empty manifest/files state for a sandbox that has never synced', async () => {
    vi.mocked(sandboxApi.get).mockResolvedValue(neverSyncedDetail)
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(emptyFilesPage)
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('local-dev').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('Not synced yet')).toBeInTheDocument()
    expect(screen.getByText('No files synced yet')).toBeInTheDocument()
    expect(screen.getByText(/Sync a valid app before running handlers/)).toBeInTheDocument()
  })

  it('renders a populated sandbox: manifest summary, config types/handlers, and synced files', async () => {
    vi.mocked(sandboxApi.get).mockResolvedValue(populatedDetail)
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(populatedFilesPage)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Splunk Enterprise')).toBeInTheDocument()
    })

    // Manifest summary
    expect(screen.getByText('1.1.0')).toBeInTheDocument()
    expect(screen.getByText('Index Configuration')).toBeInTheDocument()
    // "validate" also appears as the run panel's default-selected handler option,
    // so assert presence rather than uniqueness.
    expect(screen.getAllByText('validate').length).toBeGreaterThan(0)
    expect(screen.getByText(/Valid — 22 server sources transpiled/)).toBeInTheDocument()

    // Files — the editor's file list leads with the basename (title carries the full path).
    expect(screen.getByText('manifest.yaml')).toBeInTheDocument()
    expect(screen.getByTitle('config-types/indexes/validate.ts')).toBeInTheDocument()
  })

  it('shows a "not found" state and a way back when the sandbox cannot be loaded', async () => {
    vi.mocked(sandboxApi.get).mockRejectedValue(new SandboxApiError('Sandbox not found', 404))
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(emptyFilesPage)
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sandbox not found' })).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Back to Sandboxes' })).toBeInTheDocument()
  })

  it('runs a handler and renders the result, including captured logs', async () => {
    vi.mocked(sandboxApi.get).mockResolvedValue(populatedDetail)
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(populatedFilesPage)
    vi.mocked(sandboxApi.run).mockResolvedValue(RUN_RESPONSE)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run handler' })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: 'Run handler' }))

    await waitFor(() => {
      expect(sandboxApi.run).toHaveBeenCalledWith(SANDBOX_ID, {
        configTypeId: 'indexes',
        handler: 'validate',
      })
    })
    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('validating index main')).toBeInTheDocument()
  })

  it('renders a clear message (with status code) when a run is rejected', async () => {
    vi.mocked(sandboxApi.get).mockResolvedValue(populatedDetail)
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(populatedFilesPage)
    vi.mocked(sandboxApi.run).mockRejectedValue(
      new SandboxApiError('Sandbox runner concurrency limit reached (2 concurrent run(s) per tenant); retry shortly', 429),
    )
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run handler' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: 'Run handler' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('concurrency limit reached')
    expect(screen.getByText('[429]')).toBeInTheDocument()
  })

  it('deletes the sandbox after confirmation and navigates back to the list', async () => {
    vi.mocked(sandboxApi.get).mockResolvedValue(populatedDetail)
    vi.mocked(sandboxApi.getFiles).mockResolvedValue(populatedFilesPage)
    vi.mocked(sandboxApi.delete).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('local-dev').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: 'Delete sandbox local-dev' }))
    await waitFor(() => {
      expect(screen.getByText('Delete sandbox')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(sandboxApi.delete).toHaveBeenCalledWith(SANDBOX_ID)
      expect(screen.getByText('SANDBOXES LIST')).toBeInTheDocument()
    })
  })
})

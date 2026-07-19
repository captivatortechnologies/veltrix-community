import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SandboxPreviewCard } from '../components/SandboxPreviewCard'
import { ToastProvider } from '../../../components/shared/Toast'
import type { SandboxDetail } from '../../../services/sandboxApi'
import { importSandboxClientBundle, type SandboxAppClientModule } from '../previewBundle'

// ============================================================================
// SandboxPreviewCard tests (S6.5)
//
// Fictional page/component names throughout (Widgets/Gadgets/... — never
// Splunk) to prove nav resolution and page mounting are driven entirely by
// the manifest + bundle contracts, nothing hardcoded. Bundle loading itself
// (blob-import) is mocked at the previewBundle module boundary — that
// mechanism is exercised live (server bundle route + real browser blob
// import) rather than in jsdom, which cannot faithfully emulate it.
// ============================================================================

vi.mock('../previewBundle', async () => {
  const actual = await vi.importActual<typeof import('../previewBundle')>('../previewBundle')
  return {
    ...actual,
    importSandboxClientBundle: vi.fn(),
    installPreviewAuthFetchGuard: vi.fn(() => () => {}),
  }
})

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

function emitFileChanged(sandboxId: string, path: string) {
  act(() => {
    realtimeHandlers.forEach((handler) =>
      handler({
        type: 'sandbox:file-changed',
        sandboxId,
        payload: { sandboxId, path, sha256: 'f'.repeat(64), previousSha256: null, size: 42, origin: 'cli', originClientId: null },
        receivedAt: Date.now(),
      }),
    )
  })
}

const mockImportBundle = vi.mocked(importSandboxClientBundle)

// ---------------------------------------------------------------------------
// Fixtures — fictional app, fictional pages
// ---------------------------------------------------------------------------

const SANDBOX_ID = 'sb-fictional-1'

function makeSandbox(overrides: Partial<SandboxDetail> = {}): SandboxDetail {
  const now = Date.now()
  return {
    id: SANDBOX_ID,
    customerId: 'cust-1',
    name: 'my-fictional-sandbox',
    appId: 'fictional-app',
    status: 'ACTIVE',
    createdById: 'user-1',
    lastSyncAt: new Date(now).toISOString(),
    fileCount: 4,
    sizeBytes: 4096,
    expiresAt: new Date(now + 7 * 86400_000).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    manifest: {
      appId: 'fictional-app',
      name: 'Fictional App',
      version: '0.1.0',
      configTypes: [],
      client: {
        entry: 'client/index',
        pages: [
          { path: '/widgets', component: 'WidgetsPage', label: 'Widgets', nav: 'sidebar', order: 1 },
          { path: '/widgets/detail', component: 'WidgetDetailPage', label: 'Detail', nav: 'tab', parent: '/widgets', order: 1 },
          { path: '/gadgets', component: 'GadgetsPage', label: 'Gadgets', nav: 'sidebar', order: 2 },
          { path: '/secret-diagnostics', component: 'DiagnosticsPage', label: 'Diagnostics', nav: 'hidden' },
        ],
      },
      valid: true,
      errors: [],
      warnings: [],
      transpiledCount: 4,
    },
    ...overrides,
  }
}

const WidgetsPage: React.FC = () => <div>Widgets content</div>
const WidgetDetailPage: React.FC = () => <div>Widget detail content</div>
const GadgetsPage: React.FC = () => <div>Gadgets content</div>
const ThrowingGadgetsPage: React.FC = () => {
  throw new Error('kaboom in GadgetsPage')
}

function bundle(pages: SandboxAppClientModule['pages']): SandboxAppClientModule {
  return { id: 'fictional-app', pages }
}

function renderCard(sandbox: SandboxDetail) {
  return render(
    <ToastProvider>
      <SandboxPreviewCard sandbox={sandbox} />
    </ToastProvider>,
  )
}

describe('SandboxPreviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    realtimeHandlers = []
  })

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  it('explains and points at the CLI when the sandbox has never synced', () => {
    renderCard(makeSandbox({ lastSyncAt: null, manifest: null }))
    expect(screen.getByText('Nothing to preview yet')).toBeInTheDocument()
    expect(screen.getByText(/veltrix dev/)).toBeInTheDocument()
    expect(mockImportBundle).not.toHaveBeenCalled()
  })

  it('explains when the manifest declares no client UI at all', () => {
    const sandbox = makeSandbox()
    sandbox.manifest = { ...sandbox.manifest!, client: null }
    renderCard(sandbox)
    expect(screen.getByText("This app doesn't declare a client UI")).toBeInTheDocument()
    expect(mockImportBundle).not.toHaveBeenCalled()
  })

  it('explains when client.entry is declared but no sidebar page exists to switch to', () => {
    const sandbox = makeSandbox()
    sandbox.manifest = {
      ...sandbox.manifest!,
      client: { entry: 'client/index', pages: [{ path: '/internal', component: 'Internal', label: 'Internal', nav: 'hidden' }] },
    }
    renderCard(sandbox)
    expect(screen.getByText('No page-switcher pages declared')).toBeInTheDocument()
    expect(mockImportBundle).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Rendering pages from a mocked bundle
  // -------------------------------------------------------------------------

  it('renders the manifest-declared switcher pages from a mocked AppClientModule and mounts the default page', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage, WidgetDetailPage }))
    renderCard(makeSandbox())

    expect(await screen.findByText('Widgets content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Widgets' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Gadgets' })).toBeInTheDocument()
    // nav: 'hidden' page never appears in the switcher.
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument()
    expect(mockImportBundle).toHaveBeenCalledWith(SANDBOX_ID)
  })

  it('switches between top-level pages and nests tab pages under their parent', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage, WidgetDetailPage }))
    const user = userEvent.setup()
    renderCard(makeSandbox())
    await screen.findByText('Widgets content')

    // Widgets has one nested tab ("Detail"); Gadgets has none.
    expect(screen.getByRole('tab', { name: 'Detail' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Detail' }))
    expect(await screen.findByText('Widget detail content')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Gadgets' }))
    expect(await screen.findByText('Gadgets content')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Detail' })).not.toBeInTheDocument()
  })

  it('surfaces the read-only sandbox-preview notice in the header', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage }))
    renderCard(makeSandbox())
    await screen.findByText('Widgets content')

    expect(screen.getByRole('note')).toHaveTextContent(/read-only/i)
    expect(screen.getByRole('note')).toHaveTextContent(/changes aren.t saved/i)
  })

  it('shows a load-error panel with Retry when the bundle fails to import', async () => {
    mockImportBundle.mockRejectedValue(new Error('Sandbox app has no client bundle'))
    renderCard(makeSandbox())

    expect(await screen.findByText('Failed to load the sandbox client bundle')).toBeInTheDocument()
    expect(screen.getByText('Sandbox app has no client bundle')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Error boundary
  // -------------------------------------------------------------------------

  it('isolates a crashing page behind an error boundary instead of taking down the card', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage: ThrowingGadgetsPage }))
    const user = userEvent.setup()
    renderCard(makeSandbox())
    await screen.findByText('Widgets content')

    await user.click(screen.getByRole('button', { name: 'Gadgets' }))

    const alertBox = await screen.findByRole('alert')
    expect(alertBox).toHaveTextContent('"Gadgets" crashed while rendering')
    expect(screen.getByText(/kaboom in GadgetsPage/)).toBeInTheDocument()
    // The rest of the portal (the nav switcher itself) is unaffected.
    expect(screen.getByRole('button', { name: 'Widgets' })).toBeInTheDocument()

    const callsBeforeReload = mockImportBundle.mock.calls.length
    await user.click(within(alertBox).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(mockImportBundle.mock.calls.length).toBeGreaterThan(callsBeforeReload))
  })

  // -------------------------------------------------------------------------
  // Live re-import
  // -------------------------------------------------------------------------

  it('re-imports the bundle when a sandbox:file-changed event touches client/', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage }))
    renderCard(makeSandbox())
    await screen.findByText('Widgets content')
    expect(mockImportBundle).toHaveBeenCalledTimes(1)

    emitFileChanged(SANDBOX_ID, 'client/index.tsx')

    await waitFor(() => expect(mockImportBundle).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })

  it('does NOT re-import for a file-changed event outside client/', async () => {
    mockImportBundle.mockResolvedValue(bundle({ WidgetsPage, GadgetsPage }))
    renderCard(makeSandbox())
    await screen.findByText('Widgets content')
    expect(mockImportBundle).toHaveBeenCalledTimes(1)

    emitFileChanged(SANDBOX_ID, 'server/handlers/validate.ts')

    // Give the debounce window a chance to fire if it incorrectly would.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(mockImportBundle).toHaveBeenCalledTimes(1)
  })
})

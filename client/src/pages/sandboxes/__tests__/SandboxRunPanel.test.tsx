import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SandboxRunPanel } from '../components/SandboxRunPanel'
import { sandboxApi, SandboxApiError, type RunSandboxResponse } from '../../../services/sandboxApi'

vi.mock('../../../services/sandboxApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/sandboxApi')>(
    '../../../services/sandboxApi',
  )
  return {
    ...actual,
    sandboxApi: { run: vi.fn() },
  }
})

const SANDBOX_ID = 'sb-1'

function okResult(overrides: Partial<RunSandboxResponse> = {}): RunSandboxResponse {
  return {
    runId: 'run-x',
    handler: 'validate',
    configTypeId: 'x',
    ok: true,
    result: { valid: true },
    error: null,
    timedOut: false,
    durationMs: 12,
    logs: [],
    ...overrides,
  }
}

// Deliberately generic, non-Splunk config type ids/names — proves the panel derives
// everything from the manifest prop rather than any hardcoded app knowledge.
const WIDGETS = { id: 'widgets', name: 'Widgets', handlers: ['validate', 'healthCheck'] }
const GADGETS = { id: 'gadgets', name: 'Gadgets', handlers: ['validate', 'driftDetect', 'deploy', 'rollback'] }

describe('SandboxRunPanel — checks panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives "Run all checks" purely from the manifest — no hardcoded config types/handlers', async () => {
    vi.mocked(sandboxApi.run).mockResolvedValue(okResult())
    const user = userEvent.setup()
    render(
      <SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS, GADGETS]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Run all checks' }))

    await waitFor(() => expect(sandboxApi.run).toHaveBeenCalledTimes(4))
    // validate + healthCheck for Widgets, validate + driftDetect for Gadgets — never
    // deploy/rollback, and never a call for a config type this test didn't declare.
    expect(sandboxApi.run).toHaveBeenNthCalledWith(1, SANDBOX_ID, { configTypeId: 'widgets', handler: 'validate' })
    expect(sandboxApi.run).toHaveBeenNthCalledWith(2, SANDBOX_ID, { configTypeId: 'widgets', handler: 'healthCheck' })
    expect(sandboxApi.run).toHaveBeenNthCalledWith(3, SANDBOX_ID, { configTypeId: 'gadgets', handler: 'validate' })
    expect(sandboxApi.run).toHaveBeenNthCalledWith(4, SANDBOX_ID, { configTypeId: 'gadgets', handler: 'driftDetect' })
    expect(sandboxApi.run).not.toHaveBeenCalledWith(SANDBOX_ID, expect.objectContaining({ handler: 'deploy' }))
    expect(sandboxApi.run).not.toHaveBeenCalledWith(SANDBOX_ID, expect.objectContaining({ handler: 'rollback' }))

    // The arbitrary fixture names render — this fails immediately if the panel were
    // hardcoded to any specific app's config type ids (e.g. "indexes"/"roles").
    expect(await screen.findAllByText('Widgets')).not.toHaveLength(0)
    expect(screen.getAllByText('Gadgets').length).toBeGreaterThan(0)
  })

  it('says there is nothing to check when no config type declares a runnable handler', () => {
    render(
      <SandboxRunPanel
        sandboxId={SANDBOX_ID}
        sandboxStatus="ACTIVE"
        configTypes={[{ id: 'ledger', name: 'Ledger', handlers: ['deploy', 'rollback'] }]}
      />,
    )

    expect(
      screen.getByText(
        'No configuration type declares a runnable handler (validate, healthCheck, driftDetect or getStatus) — nothing to check.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run all checks' })).toBeDisabled()
  })

  it('expands a check to show its result JSON and logs, including a distinct timedOut badge', async () => {
    vi.mocked(sandboxApi.run).mockResolvedValue(
      okResult({
        ok: false,
        timedOut: true,
        durationMs: 30000,
        result: null,
        error: 'Handler exceeded the 30s limit',
        logs: [{ level: 'error', line: 'still running…' }],
      }),
    )
    const user = userEvent.setup()
    render(<SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS]} />)

    await user.click(screen.getByRole('button', { name: 'Run all checks' }))
    await waitFor(() => expect(sandboxApi.run).toHaveBeenCalledTimes(2))

    const timedOutBadges = await screen.findAllByText('Timed out')
    expect(timedOutBadges.length).toBeGreaterThan(0)

    const [firstRow] = screen.getAllByRole('button', { expanded: false })
    await user.click(firstRow)

    expect(await screen.findByText('still running…')).toBeInTheDocument()
    expect(screen.getByText(/Handler exceeded the 30s limit/)).toBeInTheDocument()
  })

  it('aborts the remaining checks on a 429 (concurrency) response and marks them skipped', async () => {
    vi.mocked(sandboxApi.run)
      .mockResolvedValueOnce(okResult({ configTypeId: 'widgets', handler: 'validate' }))
      .mockRejectedValueOnce(
        new SandboxApiError('Sandbox runner concurrency limit reached (2 concurrent run(s) per tenant)', 429),
      )
    const user = userEvent.setup()
    render(
      <SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS, GADGETS]} />,
    )

    await user.click(screen.getByRole('button', { name: 'Run all checks' }))

    await waitFor(() => expect(sandboxApi.run).toHaveBeenCalledTimes(2))
    // Third and fourth planned checks (gadgets/validate, gadgets/driftDetect) never ran.
    expect(screen.getAllByText('Skipped').length).toBe(2)
    expect(screen.getByText(/\[429\]/)).toBeInTheDocument()
    expect(screen.getByText(/concurrency limit reached/)).toBeInTheDocument()
  })

  it('handles a 409 (never synced/syncing) response for a single check without crashing the batch UI', async () => {
    vi.mocked(sandboxApi.run).mockRejectedValue(new SandboxApiError('Sandbox is still syncing', 409))
    const user = userEvent.setup()
    render(<SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS]} />)

    await user.click(screen.getByRole('button', { name: 'Run all checks' }))

    expect(await screen.findByText(/\[409\]/)).toBeInTheDocument()
    expect(screen.getByText(/Sandbox is still syncing/)).toBeInTheDocument()
  })

  it('handles a 410 (expired sandbox) response with a clear message', async () => {
    vi.mocked(sandboxApi.run).mockRejectedValue(new SandboxApiError('Sandbox has expired', 410))
    const user = userEvent.setup()
    render(<SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS]} />)

    await user.click(screen.getByRole('button', { name: 'Run all checks' }))

    expect(await screen.findByText(/\[410\]/)).toBeInTheDocument()
    expect(screen.getByText(/Sandbox has expired/)).toBeInTheDocument()
  })

  it('still supports the manual single-handler run independently of the batch', async () => {
    vi.mocked(sandboxApi.run).mockResolvedValue(okResult({ configTypeId: 'widgets', handler: 'validate' }))
    const user = userEvent.setup()
    render(<SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="ACTIVE" configTypes={[WIDGETS]} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Run handler' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Run handler' }))

    await waitFor(() =>
      expect(sandboxApi.run).toHaveBeenCalledWith(SANDBOX_ID, { configTypeId: 'widgets', handler: 'validate' }),
    )
    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })

  it('disables "Run all checks" while the sandbox is not ACTIVE', () => {
    render(<SandboxRunPanel sandboxId={SANDBOX_ID} sandboxStatus="SYNCING" configTypes={[WIDGETS]} />)
    expect(screen.getByRole('button', { name: 'Run all checks' })).toBeDisabled()
  })
})

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddConfigTypeDialog } from '../components/AddConfigTypeDialog'
import { ToastProvider } from '../../../components/shared/Toast'
import { sandboxApi } from '../../../services/sandboxApi'

// ============================================================================
// AddConfigTypeDialog tests
//
// The dialog scaffolds a new configuration type through the sandbox API. Tests
// cover client-side slug validation (mirrors the server rule so bad ids never
// round-trip), the success path (API call shape + onAdded), and error surfacing.
// ============================================================================

vi.mock('../../../services/sandboxApi', async () => {
  const actual = await vi.importActual<typeof import('../../../services/sandboxApi')>(
    '../../../services/sandboxApi',
  )
  return { ...actual, sandboxApi: { addConfigType: vi.fn() } }
})

const SANDBOX_ID = 'sb-1'
const CLIENT_ID = 'client-abc'

function renderDialog(overrides: Partial<React.ComponentProps<typeof AddConfigTypeDialog>> = {}) {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  render(
    <ToastProvider>
      <AddConfigTypeDialog
        isOpen
        onClose={onClose}
        sandboxId={SANDBOX_ID}
        originClientId={CLIENT_ID}
        onAdded={onAdded}
        {...overrides}
      />
    </ToastProvider>,
  )
  return { onClose, onAdded }
}

describe('AddConfigTypeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps submit disabled until a valid slug is entered', async () => {
    const user = userEvent.setup()
    renderDialog()

    const submit = screen.getByRole('button', { name: 'Add configuration type' })
    expect(submit).toBeDisabled()

    // Invalid: uppercase / spaces are rejected with an inline error.
    await user.type(screen.getByLabelText('ID'), 'Bad Id')
    expect(await screen.findByText(/lowercase letters, digits and single hyphens/i)).toBeInTheDocument()
    expect(submit).toBeDisabled()
    expect(sandboxApi.addConfigType).not.toHaveBeenCalled()
  })

  it('submits a valid config type and reports success', async () => {
    vi.mocked(sandboxApi.addConfigType).mockResolvedValue({
      configTypeId: 'detections',
      createdPaths: ['config-types/detections/canvas.yaml', 'manifest.yaml'],
      manifest: null,
    })
    const user = userEvent.setup()
    const { onAdded, onClose } = renderDialog()

    await user.type(screen.getByLabelText('ID'), 'detections')
    await user.type(screen.getByLabelText('Name (optional)'), 'Detections')
    await user.type(screen.getByLabelText('Component types (optional)'), 'server, forwarder')

    const submit = screen.getByRole('button', { name: 'Add configuration type' })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    await waitFor(() =>
      expect(sandboxApi.addConfigType).toHaveBeenCalledWith(SANDBOX_ID, {
        id: 'detections',
        name: 'Detections',
        componentTypes: ['server', 'forwarder'],
        originClientId: CLIENT_ID,
      }),
    )
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('detections', expect.any(Array)))
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText(/scaffolded/i)).toBeInTheDocument()
  })

  it('surfaces a server error and keeps the dialog open', async () => {
    vi.mocked(sandboxApi.addConfigType).mockRejectedValue(new Error('already exists in this sandbox'))
    const user = userEvent.setup()
    const { onAdded, onClose } = renderDialog()

    await user.type(screen.getByLabelText('ID'), 'policies')
    const submit = screen.getByRole('button', { name: 'Add configuration type' })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    expect(await screen.findByText(/already exists in this sandbox/i)).toBeInTheDocument()
    expect(onAdded).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('omits optional fields when left blank', async () => {
    vi.mocked(sandboxApi.addConfigType).mockResolvedValue({
      configTypeId: 'threat-intel',
      createdPaths: ['manifest.yaml'],
      manifest: null,
    })
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('ID'), 'threat-intel')
    const submit = screen.getByRole('button', { name: 'Add configuration type' })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    await waitFor(() =>
      expect(sandboxApi.addConfigType).toHaveBeenCalledWith(SANDBOX_ID, {
        id: 'threat-intel',
        name: undefined,
        componentTypes: [],
        originClientId: CLIENT_ID,
      }),
    )
  })
})

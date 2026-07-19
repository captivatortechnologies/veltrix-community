/**
 * Tests: ReviewsDrawer — the GitHub-PR-style review surface for a configuration.
 * Renders reviewers from a mocked configurationCanvasApi, asserts approve/reject
 * wire to the right methods, and asserts VersionControlPanel is driven with
 * showApprovals={false} + an onRevert callback (the critical wiring contract).
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import { ReviewsDrawer } from '../ReviewsDrawer'
import { configurationCanvasApi } from '@/components/shared/ConfigurationCanvas'
import { ToastProvider } from '@/components/shared/Toast'

// Capture the props VersionControlPanel is rendered with.
const vcp = vi.hoisted(() => ({ props: null as any }))

vi.mock('@/components/shared/VersionControl', () => ({
  VersionControlPanel: (props: any) => {
    vcp.props = props
    return <div data-testid="vcp">version-control-panel</div>
  },
}))

// Keep the real module (ApprovalSubmissionDialog, types) but mock the CRUD api.
vi.mock('@/components/shared/ConfigurationCanvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/shared/ConfigurationCanvas')>()
  return {
    ...actual,
    configurationCanvasApi: {
      ...actual.configurationCanvasApi,
      getApprovals: vi.fn(),
      getHistory: vi.fn(),
      approveCanvas: vi.fn(),
      rejectCanvas: vi.fn(),
      getComments: vi.fn(),
      addComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    },
  }
})

const api = configurationCanvasApi as unknown as {
  getApprovals: Mock
  getHistory: Mock
  approveCanvas: Mock
  rejectCanvas: Mock
  getComments: Mock
}

const config: any = {
  id: 'cfg-1',
  name: 'Prod indexes',
  status: 'PENDING_APPROVAL',
  version: 2,
  tags: [],
}

const approvalsPayload = {
  canvasId: 'cfg-1',
  canvasStatus: 'PENDING_APPROVAL' as const,
  approvals: [
    {
      id: 'ap-1',
      approver: { id: 'user-approver', name: 'Ada', email: 'ada@x.com' },
      status: 'PENDING' as const,
      comment: undefined,
      submissionComment: 'Please review retention settings',
      respondedAt: undefined,
      createdAt: '2026-01-01T00:00:00Z',
      environments: [{ id: 'e1', name: 'prod' }],
    },
    {
      id: 'ap-2',
      approver: { id: 'user-2', name: 'Bob', email: 'bob@x.com' },
      status: 'APPROVED' as const,
      comment: 'LGTM',
      submissionComment: undefined,
      respondedAt: '2026-01-02T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      environments: [],
    },
  ],
  summary: { total: 2, pending: 1, approved: 1, rejected: 0 },
}

function renderDrawer(overrides: Partial<React.ComponentProps<typeof ReviewsDrawer>> = {}) {
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <ReviewsDrawer
        config={config}
        currentUserId="user-approver"
        fetchUsers={vi.fn().mockResolvedValue([])}
        fetchTags={vi.fn().mockResolvedValue([])}
        onClose={onClose}
        onChanged={onChanged}
        {...overrides}
      />
    </ToastProvider>,
  )
  return { onChanged, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  vcp.props = null
  api.getApprovals.mockResolvedValue(approvalsPayload)
  api.getHistory.mockResolvedValue([])
  api.getComments.mockResolvedValue([])
  api.approveCanvas.mockResolvedValue(approvalsPayload)
  api.rejectCanvas.mockResolvedValue(approvalsPayload)
})

describe('ReviewsDrawer', () => {
  it('renders reviewers, the approved N/M summary, and the submission description', async () => {
    renderDrawer()

    expect(await screen.findByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Approved 1/2')).toBeInTheDocument()
    expect(screen.getByText('Please review retention settings')).toBeInTheDocument()
    expect(api.getApprovals).toHaveBeenCalledWith('cfg-1')
  })

  it('drives VersionControlPanel with showApprovals=false and an onRevert', async () => {
    renderDrawer()
    await screen.findByText('Ada')

    expect(vcp.props).toBeTruthy()
    expect(vcp.props.entityType).toBe('CONFIGURATION_CANVAS')
    expect(vcp.props.entityId).toBe('cfg-1')
    expect(vcp.props.showApprovals).toBe(false)
    expect(typeof vcp.props.onRevert).toBe('function')
  })

  it('onRevert restores via configurationCanvasApi using entry.details.canvasHistoryId', async () => {
    ;(configurationCanvasApi as any).restoreVersion = vi.fn().mockResolvedValue({})
    renderDrawer()
    await screen.findByText('Ada')

    await vcp.props.onRevert({ id: 'h1', details: { canvasHistoryId: 'ch-77' } })
    expect((configurationCanvasApi as any).restoreVersion).toHaveBeenCalledWith('cfg-1', 'ch-77')
  })

  it('Approve calls approveCanvas for a pending assignee', async () => {
    const { onChanged } = renderDrawer()
    await screen.findByText('Ada')

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(api.approveCanvas).toHaveBeenCalledWith('cfg-1'))
    expect(onChanged).toHaveBeenCalled()
  })

  it('Request changes submits a reason to rejectCanvas', async () => {
    renderDrawer()
    await screen.findByText('Ada')

    // Open the request-changes dialog.
    await userEvent.click(screen.getByRole('button', { name: 'Request changes' }))

    const reason = await screen.findByLabelText('Rejection reason')
    await userEvent.type(reason, 'Fix the retention window')

    // The dialog submit button is the one inside the FormDialog <form> (the toolbar
    // trigger shares the accessible name but lives outside any form).
    const submit = screen
      .getAllByRole('button', { name: 'Request changes' })
      .find((b) => b.closest('form') !== null)!
    await userEvent.click(submit)

    await waitFor(() =>
      expect(api.rejectCanvas).toHaveBeenCalledWith('cfg-1', 'Fix the retention window'),
    )
  })

  it('hides reviewer actions when the signed-in user is not a pending assignee', async () => {
    renderDrawer({ currentUserId: 'someone-else' })
    await screen.findByText('Ada')

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })
})

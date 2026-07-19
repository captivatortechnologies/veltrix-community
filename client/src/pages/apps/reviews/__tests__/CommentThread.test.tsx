/**
 * Tests: CommentThread — threaded review comments backed by the configuration-canvas
 * comment endpoints. Verifies it lists threads from a mocked api and posts a new
 * top-level comment (anchored to the given historyId).
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import { CommentThread } from '../CommentThread'
import { configurationCanvasApi } from '@/components/shared/ConfigurationCanvas'
import { ToastProvider } from '@/components/shared/Toast'

vi.mock('@/components/shared/ConfigurationCanvas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/shared/ConfigurationCanvas')>()
  return {
    ...actual,
    configurationCanvasApi: {
      ...actual.configurationCanvasApi,
      getComments: vi.fn(),
      addComment: vi.fn(),
      updateComment: vi.fn(),
      deleteComment: vi.fn(),
    },
  }
})

const api = configurationCanvasApi as unknown as {
  getComments: Mock
  addComment: Mock
  updateComment: Mock
  deleteComment: Mock
}

function renderThread(props: Partial<React.ComponentProps<typeof CommentThread>> = {}) {
  render(
    <ToastProvider>
      <CommentThread canvasId="cfg-1" currentUserId="user-1" {...props} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getComments.mockResolvedValue([])
  api.addComment.mockResolvedValue({ id: 'new' })
})

describe('CommentThread', () => {
  it('renders existing threads with nested replies', async () => {
    api.getComments.mockResolvedValue([
      {
        id: 'c1',
        canvasId: 'cfg-1',
        userId: 'user-2',
        body: 'Root comment',
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        user: { id: 'user-2', name: 'Bob', email: 'bob@x.com' },
        replies: [
          {
            id: 'c2',
            canvasId: 'cfg-1',
            parentId: 'c1',
            userId: 'user-1',
            body: 'A reply',
            resolved: false,
            createdAt: '2026-01-01T01:00:00Z',
            updatedAt: '2026-01-01T01:00:00Z',
            user: { id: 'user-1', name: 'Ada', email: 'ada@x.com' },
            replies: [],
          },
        ],
      },
    ])

    renderThread()

    expect(await screen.findByText('Root comment')).toBeInTheDocument()
    expect(screen.getByText('A reply')).toBeInTheDocument()
    expect(api.getComments).toHaveBeenCalledWith('cfg-1', { historyId: undefined })
  })

  it('posts a new top-level comment anchored to the selected version', async () => {
    renderThread({ historyId: 'hist-5' })

    // Empty state until loaded.
    await screen.findByText(/No comments yet/i)

    const textarea = screen.getByLabelText('Add a comment')
    await userEvent.type(textarea, 'Looks good to me')

    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() =>
      expect(api.addComment).toHaveBeenCalledWith('cfg-1', {
        body: 'Looks good to me',
        historyId: 'hist-5',
      }),
    )
    // Re-fetches after posting.
    expect(api.getComments).toHaveBeenCalledTimes(2)
  })

  it('disables the Comment button until text is entered', async () => {
    renderThread()
    await screen.findByText(/No comments yet/i)
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled()
  })
})

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReleaseNotes } from '../ReleaseNotes'

describe('ReleaseNotes', () => {
  it('renders a fallback when no notes are provided', () => {
    render(<ReleaseNotes markdown={undefined} />)
    expect(screen.getByText(/No release notes were provided/i)).toBeInTheDocument()
  })

  it('renders headings, bullet lists and paragraphs', () => {
    const md = ['## What changed', '', '- First item', '- Second item', '', 'A closing paragraph.'].join('\n')
    render(<ReleaseNotes markdown={md} />)
    expect(screen.getByText('What changed')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('A closing paragraph.')).toBeInTheDocument()
  })

  it('renders inline bold and inline code', () => {
    render(<ReleaseNotes markdown={'Use **drift detection** with `indexes.conf`.'} />)
    expect(screen.getByText('drift detection').tagName).toBe('STRONG')
    expect(screen.getByText('indexes.conf').tagName).toBe('CODE')
  })

  it('renders safe links and drops unsafe hrefs to plain text', () => {
    render(
      <ReleaseNotes markdown={'See [the docs](https://example.com) and [bad](javascript:alert(1)).'} />,
    )
    const link = screen.getByRole('link', { name: 'the docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    // The javascript: link must NOT become an anchor.
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByText(/bad/)).toBeInTheDocument()
  })
})

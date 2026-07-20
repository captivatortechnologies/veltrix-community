import React from 'react'
import { render, screen } from '@testing-library/react'
import PipelineTimeline from '../components/PipelineTimeline'

describe('PipelineTimeline', () => {
  it('renders the five pipeline stages (one Approve gate, not Approve + Approved)', () => {
    render(<PipelineTimeline currentStatus="DRAFT" />)
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Validate')).toBeTruthy()
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Deploy')).toBeTruthy()
    expect(screen.getByText('Live')).toBeTruthy()
    // The redundant standalone "Approved" stage is gone.
    expect(screen.queryByText('Approved')).toBeNull()
  })

  it('keeps a single Approve stage when APPROVED (no duplicate "Approved")', () => {
    render(<PipelineTimeline currentStatus="APPROVED" />)
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.queryByText('Approved')).toBeNull()
  })

  it('shows compact mode without labels', () => {
    render(<PipelineTimeline currentStatus="DEPLOYED" compact />)
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByText('Live')).toBeNull()
  })

  it('renders correctly for DEPLOYED status', () => {
    const { container } = render(<PipelineTimeline currentStatus="DEPLOYED" />)
    // All five stages should be rendered
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5)
  })

  it('shows error state for VALIDATION_FAILED', () => {
    render(<PipelineTimeline currentStatus="VALIDATION_FAILED" />)
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('shows paused state for DEPLOYMENT_PAUSED', () => {
    render(<PipelineTimeline currentStatus="DEPLOYMENT_PAUSED" />)
    expect(screen.getByText('Paused')).toBeTruthy()
  })
})

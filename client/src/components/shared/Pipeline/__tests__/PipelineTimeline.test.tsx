import React from 'react'
import { render, screen } from '@testing-library/react'
import PipelineTimeline from '../components/PipelineTimeline'

describe('PipelineTimeline', () => {
  it('renders all pipeline stages', () => {
    render(<PipelineTimeline currentStatus="DRAFT" />)
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Validate')).toBeTruthy()
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Deploy')).toBeTruthy()
    expect(screen.getByText('Live')).toBeTruthy()
  })

  it('shows compact mode without labels', () => {
    render(<PipelineTimeline currentStatus="DEPLOYED" compact />)
    expect(screen.queryByText('Draft')).toBeNull()
    expect(screen.queryByText('Live')).toBeNull()
  })

  it('renders correctly for DEPLOYED status', () => {
    const { container } = render(<PipelineTimeline currentStatus="DEPLOYED" />)
    // All stages should be rendered
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(6)
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

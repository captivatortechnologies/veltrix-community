import React from 'react'
import { render, screen } from '@testing-library/react'
import PipelineStatusBadge from '../components/PipelineStatusBadge'
import type { ConfigCanvasStatus } from '../api/pipelineApi'

describe('PipelineStatusBadge', () => {
  const allStatuses: ConfigCanvasStatus[] = [
    'DRAFT',
    'VALIDATION_PENDING',
    'VALIDATION_FAILED',
    'PENDING_APPROVAL',
    'APPROVED',
    'DEPLOYMENT_QUEUED',
    'DEPLOYING',
    'DEPLOYMENT_PAUSED',
    'DEPLOYED',
    'DEPLOYMENT_FAILED',
    'ROLLED_BACK',
    'ARCHIVED',
  ]

  it.each(allStatuses)('renders badge for status: %s', (status) => {
    const { container } = render(<PipelineStatusBadge status={status} />)
    expect(container.querySelector('span')).toBeTruthy()
  })

  it('renders with different sizes', () => {
    const { rerender, container } = render(
      <PipelineStatusBadge status="DRAFT" size="sm" />
    )
    expect(container.querySelector('span')).toHaveClass('text-xs')

    rerender(<PipelineStatusBadge status="DRAFT" size="lg" />)
    expect(container.querySelector('span')).toHaveClass('text-sm')
  })

  it('hides icon when showIcon is false', () => {
    const { container } = render(
      <PipelineStatusBadge status="DRAFT" showIcon={false} />
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('hides label when showLabel is false', () => {
    render(<PipelineStatusBadge status="DEPLOYED" showLabel={false} />)
    expect(screen.queryByText('Deployed')).toBeNull()
  })

  it('shows correct label for DEPLOYED status', () => {
    render(<PipelineStatusBadge status="DEPLOYED" />)
    expect(screen.getByText('Deployed')).toBeTruthy()
  })

  it('shows correct label for DEPLOYING status', () => {
    render(<PipelineStatusBadge status="DEPLOYING" />)
    expect(screen.getByText('Deploying')).toBeTruthy()
  })
})

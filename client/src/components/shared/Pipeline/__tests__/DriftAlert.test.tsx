import React from 'react'
import { render, screen } from '@testing-library/react'
import DriftAlert from '../components/DriftAlert'
import type { DriftRecord } from '../api/pipelineApi'

const baseRecord = (diffs: DriftRecord['diffs']): DriftRecord => ({
  id: 'd1',
  appId: 'okta-identity',
  configTypeId: 'groups',
  environmentId: 'e1',
  componentId: 'c1',
  severity: 'warning',
  diffs,
  isResolved: false,
  detectedAt: '2026-07-22T12:00:00.000Z',
  resolvedAt: null,
  resolvedAction: null,
  environment: { id: 'e1', name: 'OKTA-Sandbox' },
  component: { id: 'c1', hostname: 'acme.okta.com' },
})

describe('DriftAlert header attribution', () => {
  it('summarizes who changed it + when from the diffs, without expanding', () => {
    const record = baseRecord([
      { field: 'description', expected: 'a', actual: 'b', severity: 'warning',
        actor: { name: 'Jane Doe', email: 'jane@acme.com', at: '2026-07-22T10:00:00.000Z' } },
    ])
    render(<DriftAlert drift={record} />)
    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.getByText(/Changed by/)).toBeTruthy()
    // Full per-field table is collapsed until expanded.
    expect(screen.queryByText('Expected')).toBeNull()
  })

  it('shows the most recent actor and counts other distinct people', () => {
    const record = baseRecord([
      { field: 'a', expected: 1, actual: 2, severity: 'warning',
        actor: { name: 'Older Editor', at: '2026-07-20T08:00:00.000Z' } },
      { field: 'b', expected: 3, actual: 4, severity: 'warning',
        actor: { name: 'Recent Editor', at: '2026-07-22T09:00:00.000Z' } },
    ])
    render(<DriftAlert drift={record} />)
    expect(screen.getByText('Recent Editor')).toBeTruthy()
    expect(screen.getByText(/\+1 other/)).toBeTruthy()
  })

  it('renders no attribution line when no diff has an actor', () => {
    const record = baseRecord([{ field: 'a', expected: 1, actual: 2, severity: 'info' }])
    render(<DriftAlert drift={record} />)
    expect(screen.queryByText(/Changed by/)).toBeNull()
  })
})

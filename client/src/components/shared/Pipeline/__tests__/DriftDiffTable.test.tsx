import React from 'react'
import { render, screen } from '@testing-library/react'
import DriftDiffTable from '../components/DriftDiffTable'
import type { DriftDiff } from '../api/pipelineApi'

describe('DriftDiffTable', () => {
  it('renders field / expected / actual / severity columns', () => {
    const diffs: DriftDiff[] = [
      { field: 'maxDataSizeMB', expected: 500, actual: 250, severity: 'critical' },
    ]
    render(<DriftDiffTable diffs={diffs} />)
    expect(screen.getByText('maxDataSizeMB')).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('250')).toBeTruthy()
    expect(screen.getByText('critical')).toBeTruthy()
  })

  it('shows the actor name and formatted timestamp when attribution is present', () => {
    const diffs: DriftDiff[] = [
      {
        field: 'scanInterval',
        expected: 60,
        actual: 120,
        severity: 'warning',
        actor: { name: 'Jane Doe', email: 'jane@example.com', at: '2026-01-15T10:30:00.000Z' },
      },
    ]
    render(<DriftDiffTable diffs={diffs} />)
    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.getByText(new Date('2026-01-15T10:30:00.000Z').toLocaleString())).toBeTruthy()
  })

  it('renders a placeholder when no actor could be attributed', () => {
    const diffs: DriftDiff[] = [
      { field: 'scanInterval', expected: 60, actual: 120, severity: 'info' },
    ]
    render(<DriftDiffTable diffs={diffs} />)
    expect(screen.getByTitle('No attribution available')).toBeTruthy()
  })
})

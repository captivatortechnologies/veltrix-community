import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PipelineNav from '../PipelineNav'

const renderWithRouter = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PipelineNav />
    </MemoryRouter>
  )

describe('PipelineNav', () => {
  it('renders all navigation items', () => {
    renderWithRouter('/pipeline')
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Environments')).toBeTruthy()
    expect(screen.getByText('Drift')).toBeTruthy()
  })

  it('highlights the active tab based on route', () => {
    renderWithRouter('/pipeline')
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toContain('border-blue-600')
  })

  it('highlights environments tab when on environments route', () => {
    renderWithRouter('/pipeline/environments')
    const envLink = screen.getByText('Environments').closest('a')
    expect(envLink?.className).toContain('border-blue-600')

    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toContain('border-transparent')
  })

  it('highlights drift tab when on drift route', () => {
    renderWithRouter('/pipeline/drift')
    const driftLink = screen.getByText('Drift').closest('a')
    expect(driftLink?.className).toContain('border-blue-600')
  })

  it('renders correct links', () => {
    renderWithRouter('/pipeline')
    expect(screen.getByText('Dashboard').closest('a')?.getAttribute('href')).toBe('/pipeline')
    expect(screen.getByText('Environments').closest('a')?.getAttribute('href')).toBe('/pipeline/environments')
    expect(screen.getByText('Drift').closest('a')?.getAttribute('href')).toBe('/pipeline/drift')
  })
})

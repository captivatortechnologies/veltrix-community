import React from 'react'
import { render, screen } from '@testing-library/react'
import ValidationResults from '../components/ValidationResults'
import type { ValidationResult } from '../api/pipelineApi'

describe('ValidationResults', () => {
  const validResult: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  }

  const invalidResult: ValidationResult = {
    valid: false,
    errors: [
      { field: 'endpoint', message: 'Endpoint is required', code: 'required' },
      { field: 'port', message: 'Port must be between 1-65535', code: 'range' },
    ],
    warnings: [
      { field: 'timeout', message: 'Timeout is very high', code: 'performance' },
    ],
  }

  it('shows success for valid result', () => {
    render(<ValidationResults result={validResult} />)
    expect(screen.getByText('Validation Passed')).toBeTruthy()
  })

  it('shows failure for invalid result', () => {
    render(<ValidationResults result={invalidResult} />)
    expect(screen.getByText(/Validation Failed/)).toBeTruthy()
  })

  it('displays error messages', () => {
    render(<ValidationResults result={invalidResult} />)
    expect(screen.getByText('Endpoint is required')).toBeTruthy()
    expect(screen.getByText('Port must be between 1-65535')).toBeTruthy()
  })

  it('displays warning messages', () => {
    render(<ValidationResults result={invalidResult} />)
    expect(screen.getByText('Timeout is very high')).toBeTruthy()
  })

  it('renders compact mode', () => {
    render(<ValidationResults result={validResult} compact />)
    expect(screen.getByText('Valid')).toBeTruthy()
  })

  it('renders compact mode with errors', () => {
    render(<ValidationResults result={invalidResult} compact />)
    expect(screen.getByText(/2 errors/)).toBeTruthy()
  })
})

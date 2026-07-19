import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Spinner from '../Spinner';

describe('Spinner', () => {
  it('renders with an accessible status role', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('provides a default accessible label when none is given', () => {
    render(<Spinner />);
    // The visually-hidden fallback keeps the status announceable.
    expect(screen.getByText('Loading')).toBeInTheDocument();
  });

  it('shows the visible label text when provided', () => {
    render(<Spinner label="Loading indexes…" />);
    expect(screen.getByText('Loading indexes…')).toBeInTheDocument();
  });

  it('applies the default (md) size class', () => {
    const { container } = render(<Spinner />);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('w-6');
    expect(icon?.getAttribute('class')).toContain('h-6');
  });

  it('applies the requested size class', () => {
    const { container } = render(<Spinner size="lg" />);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('w-8');
    expect(icon?.getAttribute('class')).toContain('h-8');
  });

  it('is tokenized (text-primary, not a hardcoded blue)', () => {
    const { container } = render(<Spinner />);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('text-primary');
    expect(icon?.getAttribute('class')).not.toMatch(/text-blue-\d/);
  });

  it('merges a custom className onto the icon', () => {
    const { container } = render(<Spinner className="my-4" />);
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('my-4');
  });
});

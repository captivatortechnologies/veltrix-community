import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Checkbox from '../Checkbox';

describe('Checkbox', () => {
  it('renders a checkbox with an associated label', () => {
    render(<Checkbox label="Enable drift detection" />);
    const box = screen.getByRole('checkbox', { name: 'Enable drift detection' });
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute('type', 'checkbox');
  });

  it('toggles and fires onChange when clicked via its label', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Accept" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Accept' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reflects the controlled checked prop', () => {
    render(<Checkbox label="On" checked readOnly />);
    expect(screen.getByRole('checkbox', { name: 'On' })).toBeChecked();
  });

  it('shows an error with role=alert and sets aria-invalid', () => {
    render(<Checkbox label="Terms" error="You must accept" />);
    const box = screen.getByRole('checkbox', { name: 'Terms' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('You must accept');
    expect(box.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('renders helper text when there is no error', () => {
    render(<Checkbox label="Sync" helperText="Runs every 5 minutes" />);
    expect(screen.getByText('Runs every 5 minutes')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the input when disabled', () => {
    render(<Checkbox label="Locked" disabled />);
    expect(screen.getByRole('checkbox', { name: 'Locked' })).toBeDisabled();
  });

  it('uses tokenized colors (accent-primary, no hardcoded palette)', () => {
    render(<Checkbox label="Z" />);
    const box = screen.getByRole('checkbox', { name: 'Z' });
    expect(box.className).toContain('accent-primary');
    expect(box.className).not.toMatch(/text-blue-\d/);
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Checkbox ref={ref} label="Ref" />);
    expect(ref).toHaveBeenCalled();
  });
});

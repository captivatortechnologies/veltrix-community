import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Textarea from '../Textarea';

describe('Textarea', () => {
  it('renders a labelled textarea', () => {
    render(<Textarea label="Description" placeholder="Describe…" />);
    const field = screen.getByLabelText('Description');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('placeholder', 'Describe…');
  });

  it('shows an error message with role=alert and sets aria-invalid', () => {
    render(<Textarea label="Notes" error="Required field" />);
    const field = screen.getByLabelText('Notes');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Required field');
    // The error is wired to the field via aria-describedby.
    expect(field.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('renders helper text when there is no error', () => {
    render(<Textarea label="Bio" helperText="Markdown supported" />);
    expect(screen.getByText('Markdown supported')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides helper text when an error is present', () => {
    render(<Textarea label="Bio" helperText="Markdown supported" error="Too long" />);
    expect(screen.queryByText('Markdown supported')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Too long');
  });

  it('calls onChange as the user types', () => {
    const onChange = vi.fn();
    render(<Textarea label="Msg" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Msg'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('uses tokenized colors (no hardcoded palette classes)', () => {
    render(<Textarea label="X" />);
    const field = screen.getByLabelText('X');
    expect(field.className).toContain('bg-surface-raised');
    expect(field.className).toContain('text-content-primary');
    expect(field.className).not.toMatch(/text-blue-\d/);
  });

  it('forwards ref and applies custom className', () => {
    const ref = vi.fn();
    render(<Textarea ref={ref} label="Y" className="custom-textarea" />);
    expect(ref).toHaveBeenCalled();
    expect(screen.getByLabelText('Y').className).toContain('custom-textarea');
  });
});

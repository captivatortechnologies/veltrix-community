import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SearchBox from '../SearchBox';

describe('SearchBox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with the given placeholder and value', () => {
    render(<SearchBox value="splunk" onChange={vi.fn()} placeholder="Search apps…" />);
    const input = screen.getByRole('searchbox', { name: 'Search apps…' }) as HTMLInputElement;
    expect(input.value).toBe('splunk');
  });

  it('calls onChange on every keystroke when debounceMs is not set', () => {
    const handleChange = vi.fn();
    render(<SearchBox value="" onChange={handleChange} placeholder="Search" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'crowdstrike' } });
    expect(handleChange).toHaveBeenCalledWith('crowdstrike');
  });

  it('debounces onChange when debounceMs is set', () => {
    const handleChange = vi.fn();
    render(<SearchBox value="" onChange={handleChange} placeholder="Search" debounceMs={300} />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'o' } });
    fireEvent.change(input, { target: { value: 'ok' } });
    fireEvent.change(input, { target: { value: 'okta' } });

    // Input reflects every keystroke immediately even though onChange hasn't fired yet.
    expect(input.value).toBe('okta');
    expect(handleChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('okta');
  });

  it('shows a clear button only when there is text, and clicking it resets immediately (bypassing debounce)', () => {
    const handleChange = vi.fn();
    render(<SearchBox value="" onChange={handleChange} placeholder="Search" debounceMs={300} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'datadog' } });
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
    expect(handleChange).toHaveBeenCalledWith('');

    // The pending debounce for 'datadog' must not fire after the clear.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('follows external value changes (e.g. a parent clearing it) when no debounce is pending', () => {
    const { rerender } = render(<SearchBox value="splunk" onChange={vi.fn()} placeholder="Search" />);
    rerender(<SearchBox value="" onChange={vi.fn()} placeholder="Search" />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it('respects the disabled prop and hides the clear button', () => {
    render(<SearchBox value="splunk" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('searchbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('falls back to the placeholder for the accessible name when aria-label is omitted', () => {
    render(<SearchBox value="" onChange={vi.fn()} placeholder="Search installed apps" />);
    expect(screen.getByRole('searchbox', { name: 'Search installed apps' })).toBeInTheDocument();
  });

  it('prefers an explicit aria-label over the placeholder', () => {
    render(<SearchBox value="" onChange={vi.fn()} placeholder="Search" aria-label="Search installed apps by name" />);
    expect(screen.getByRole('searchbox', { name: 'Search installed apps by name' })).toBeInTheDocument();
  });
});

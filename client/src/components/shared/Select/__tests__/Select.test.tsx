import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Select, { type SelectOption } from '../Select';

const options: SelectOption[] = [
  { value: 'splunk', label: 'Splunk' },
  { value: 'crowdstrike', label: 'CrowdStrike' },
  { value: 'okta', label: 'Okta', disabled: true },
  { value: 'datadog', label: 'Datadog' },
];

describe('Select', () => {
  it('renders the placeholder when no value is selected', () => {
    render(<Select options={options} placeholder="All Vendors" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('All Vendors');
  });

  it('renders the label of the selected option', () => {
    render(<Select options={options} value="crowdstrike" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('CrowdStrike');
  });

  it('is closed by default and opens on click', () => {
    render(<Select options={options} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(options.length);
  });

  it('calls onChange and closes when an option is clicked', () => {
    const handleChange = vi.fn();
    render(<Select options={options} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Datadog'));

    expect(handleChange).toHaveBeenCalledWith('datadog');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not select a disabled option', () => {
    const handleChange = vi.fn();
    render(<Select options={options} onChange={handleChange} />);

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Okta'));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('opens and selects the highlighted option via keyboard', () => {
    const handleChange = vi.fn();
    render(<Select options={options} onChange={handleChange} />);

    const trigger = screen.getByRole('combobox');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // move to CrowdStrike
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith('crowdstrike');
  });

  it('closes without changing the value on Escape', () => {
    const handleChange = vi.fn();
    render(<Select options={options} value="splunk" onChange={handleChange} />);

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('marks the selected option with aria-selected', () => {
    render(<Select options={options} value="crowdstrike" />);
    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    const selected = within(listbox).getByText('CrowdStrike').closest('[role="option"]');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('exposes the label via a linked <label> element', () => {
    render(<Select options={options} label="Vendor" />);
    expect(screen.getByLabelText('Vendor')).toBe(screen.getByRole('combobox'));
  });

  it('shows an error message and marks the trigger invalid', () => {
    render(<Select options={options} error="Vendor is required" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Vendor is required');
  });

  it('does not open when disabled', () => {
    render(<Select options={options} disabled />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('closes when clicking outside', () => {
    render(
      <div>
        <Select options={options} />
        <button>Outside</button>
      </div>
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

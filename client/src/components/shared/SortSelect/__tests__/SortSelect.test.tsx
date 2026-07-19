import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SortSelect from '../SortSelect';

const options = [
  { value: 'name', label: 'Name' },
  { value: 'updatedAt', label: 'Last updated' },
];

describe('SortSelect', () => {
  it('renders the field select with the current value', () => {
    render(<SortSelect options={options} value="name" direction="asc" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveTextContent('Name');
  });

  it('calls onChange with the new field and the unchanged direction when a field is picked', () => {
    const handleChange = vi.fn();
    render(<SortSelect options={options} value="name" direction="desc" onChange={handleChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Sort by' }));
    fireEvent.click(screen.getByText('Last updated'));

    expect(handleChange).toHaveBeenCalledWith('updatedAt', 'desc');
  });

  it('shows an accessible label reflecting the current direction', () => {
    const { rerender } = render(<SortSelect options={options} value="name" direction="asc" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sort ascending' })).toBeInTheDocument();

    rerender(<SortSelect options={options} value="name" direction="desc" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sort descending' })).toBeInTheDocument();
  });

  it('toggles direction and calls onChange with the same field when the direction button is clicked', () => {
    const handleChange = vi.fn();
    render(<SortSelect options={options} value="updatedAt" direction="asc" onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }));
    expect(handleChange).toHaveBeenCalledWith('updatedAt', 'desc');
  });

  it('disables both controls when disabled is true', () => {
    render(<SortSelect options={options} value="name" direction="asc" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sort ascending' })).toBeDisabled();
  });
});

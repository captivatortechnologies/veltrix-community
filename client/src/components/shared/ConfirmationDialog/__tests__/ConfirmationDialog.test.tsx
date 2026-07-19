import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmationDialog } from '../ConfirmationDialog';
import type { ConfirmationState } from '../types';

const makeConfirmation = (overrides: Partial<ConfirmationState> = {}): ConfirmationState => ({
  id: 'confirm-1',
  isOpen: true,
  title: 'Delete infrastructure?',
  message: 'This action cannot be undone.',
  variant: 'danger',
  resolve: () => {},
  ...overrides,
});

describe('ConfirmationDialog', () => {
  it('renders nothing when there is no open confirmation', () => {
    const { container } = render(
      <ConfirmationDialog confirmation={null} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('portals the alertdialog to document.body with its title and message', () => {
    const { container } = render(
      <ConfirmationDialog confirmation={makeConfirmation()} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Delete infrastructure?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    // Portaled: not rendered inside the local render container.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('fires onConfirm and onCancel from the action buttons', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        confirmation={makeConfirmation({ confirmText: 'Delete', cancelText: 'Keep' })}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape via onCancel', () => {
    const onCancel = vi.fn();
    render(<ConfirmationDialog confirmation={makeConfirmation()} onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

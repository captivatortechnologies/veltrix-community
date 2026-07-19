import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal, { type ModalProps } from '../Modal';

const noop = () => {};

const renderModal = (overrides: Partial<ModalProps> = {}) => {
  const onClose = overrides.onClose ?? vi.fn();

  const utils = render(
    <Modal isOpen onClose={onClose} title="Review deployment plan" {...overrides}>
      <p>Body content</p>
    </Modal>
  );

  return { ...utils, onClose };
};

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={noop} title="Review deployment plan">
        <p>Body content</p>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, subtitle, and children when open', () => {
    renderModal({ subtitle: 'Changes that will be applied to BYOL001.' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Review deployment plan')).toBeInTheDocument();
    expect(screen.getByText('Changes that will be applied to BYOL001.')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('portals the overlay out of the local tree into document.body', () => {
    // The fix: a non-portaled `fixed inset-0` overlay is trapped by an app
    // surface's containing block (the scrolled `<main>`), so it spills instead
    // of centering. OverlayPortal renders it at document.body against the
    // viewport. Assert the dialog escapes its local render container.
    const { container } = render(
      <div data-testid="app-surface">
        <Modal isOpen onClose={noop} title="Review deployment plan">
          <p>Body content</p>
        </Modal>
      </div>
    );

    const dialog = screen.getByRole('dialog');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('wires up aria attributes: role, aria-modal, aria-labelledby, and aria-describedby', () => {
    renderModal({ subtitle: 'Some helper copy.' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Review deployment plan');

    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Some helper copy.');
  });

  it('omits aria-describedby when no subtitle is given', () => {
    renderModal();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('renders footer content when provided', () => {
    renderModal({ footer: <button type="button">Apply</button> });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const { onClose } = renderModal();

    // The dialog is the direct child of the backdrop overlay.
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the dialog content itself is clicked', () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose on backdrop click when disableBackdropClose is set', () => {
    const { onClose } = renderModal({ disableBackdropClose: true });

    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the X button is clicked', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the close button when hideCloseButton is set', () => {
    renderModal({ hideCloseButton: true });
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when disableEscapeClose is set', () => {
    const { onClose } = renderModal({ disableEscapeClose: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the max-w-2xl class for size="lg"', () => {
    renderModal({ size: 'lg' });
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('applies the max-w-lg class for the default size ("md")', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
  });

  it('moves focus into the dialog when it opens', () => {
    renderModal();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});

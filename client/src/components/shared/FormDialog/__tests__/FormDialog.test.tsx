import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import FormDialog, { type FormDialogProps } from '../FormDialog';

const noop = () => {};

const renderDialog = (overrides: Partial<FormDialogProps> = {}) => {
  const onClose = overrides.onClose ?? vi.fn();
  const onSubmit = overrides.onSubmit ?? vi.fn();

  const utils = render(
    <FormDialog
      isOpen
      onClose={onClose}
      title="Add Vendor"
      onSubmit={onSubmit}
      {...overrides}
    >
      <label htmlFor="vendor-name">Name</label>
      <input id="vendor-name" />
    </FormDialog>
  );

  return { ...utils, onClose, onSubmit };
};

describe('FormDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <FormDialog isOpen={false} onClose={noop} title="Add Vendor" onSubmit={noop}>
        <input aria-label="Name" />
      </FormDialog>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, description, and children when open', () => {
    renderDialog({ description: 'Vendors appear in the connectivity picker.' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Vendor')).toBeInTheDocument();
    expect(screen.getByText('Vendors appear in the connectivity picker.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('wires up aria attributes: role, aria-modal, aria-labelledby, and aria-describedby', () => {
    renderDialog({ description: 'Some helper copy.' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Add Vendor');

    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Some helper copy.');
  });

  it('omits aria-describedby when no description is given', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('renders the form fields inside a real <form> element', () => {
    renderDialog();
    const input = screen.getByLabelText('Name');
    expect(input.closest('form')).toBeInTheDocument();
  });

  it('calls onSubmit with preventDefault when the submit button is clicked', () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit when Enter is pressed inside a field', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await user.type(screen.getByLabelText('Name'), 'Acme Corp{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not navigate/reload the page on submit (preventDefault is applied)', () => {
    const { onSubmit } = renderDialog();
    const form = screen.getByRole('dialog').querySelector('form')!;
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });

    fireEvent(form, submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows a danger-toned error banner when error is provided', () => {
    renderDialog({ error: 'Name is required.' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Name is required.');
  });

  it('does not render an error banner when error is null or omitted', () => {
    renderDialog({ error: null });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the default submit/cancel labels', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('supports custom submit/cancel labels', () => {
    renderDialog({ submitText: 'Create', cancelText: 'Discard' });
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const { onClose } = renderDialog();

    // The dialog is rendered as the direct child of the backdrop overlay.
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the dialog content itself is clicked', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose on backdrop click when disableBackdropClose is set', () => {
    const { onClose } = renderDialog({ disableBackdropClose: true });

    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the cancel button is clicked', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the X button is clicked', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape while isSubmitting', () => {
    const { onClose } = renderDialog({ isSubmitting: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not call onClose on backdrop click while isSubmitting', () => {
    const { onClose } = renderDialog({ isSubmitting: true });
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables the cancel button while isSubmitting', () => {
    renderDialog({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables the X button while isSubmitting', () => {
    renderDialog({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  });

  it('shows the submit button in a loading state while isSubmitting', () => {
    renderDialog({ isSubmitting: true });
    const submitButton = screen.getByRole('button', { name: 'Save' });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('aria-busy', 'true');
  });

  it('disables the submit button when submitDisabled is set, without affecting cancel', () => {
    renderDialog({ submitDisabled: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
  });

  it('applies the max-w-md class for size="sm"', () => {
    renderDialog({ size: 'sm' });
    expect(screen.getByRole('dialog')).toHaveClass('max-w-md');
  });

  it('applies the max-w-lg class for the default size ("md")', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
  });

  it('applies the max-w-2xl class for size="lg"', () => {
    renderDialog({ size: 'lg' });
    expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
  });

  it('moves focus into the dialog when it opens', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('restores focus to the previously-focused element when it closes', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender } = render(
      <FormDialog isOpen onClose={noop} title="Add Vendor" onSubmit={noop}>
        <input aria-label="Name" />
      </FormDialog>
    );
    expect(trigger).not.toHaveFocus();

    rerender(
      <FormDialog isOpen={false} onClose={noop} title="Add Vendor" onSubmit={noop}>
        <input aria-label="Name" />
      </FormDialog>
    );

    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });
});

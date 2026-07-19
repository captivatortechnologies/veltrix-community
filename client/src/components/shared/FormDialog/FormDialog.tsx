import React, { useEffect, useId, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '../Button';
import { OverlayPortal } from '../OverlayPortal';

export type FormDialogSize = 'sm' | 'md' | 'lg';

export interface FormDialogProps {
  /** Controls visibility. Renders nothing when `false`. */
  isOpen: boolean;
  /** Called on backdrop click (unless `disableBackdropClose`), Escape, the cancel button, and the X button. Never called while `isSubmitting`. */
  onClose: () => void;
  title: string;
  /** Secondary text rendered under the title. */
  description?: string;
  /** The form fields. */
  children: React.ReactNode;
  /** Wired to the underlying `<form onSubmit>` — `preventDefault` is handled internally. */
  onSubmit: () => void | Promise<void>;
  submitText?: string;
  cancelText?: string;
  /** Puts the submit button into its loading state and disables every close path (backdrop, Escape, cancel, X). */
  isSubmitting?: boolean;
  /** Danger-toned banner rendered between the description and the fields. */
  error?: string | null;
  size?: FormDialogSize;
  /** When `true`, clicking the backdrop no longer calls `onClose`. */
  disableBackdropClose?: boolean;
  submitDisabled?: boolean;
}

const sizeStyles: Record<FormDialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * FormDialog Component
 *
 * A modal shell for arbitrary form content — the sibling of `ConfirmationDialog` for cases
 * that need real fields instead of a yes/no prompt (e.g. "Create Vendor", "Edit Schedule").
 * Content is wrapped in a real `<form>` so pressing Enter in a field submits it, exactly like
 * a native form.
 *
 * Accessible by default: `role="dialog"`, `aria-modal="true"`, labelled by the title and
 * (when present) described by the description, closes on Escape, moves focus into the
 * dialog on open, and restores focus to the previously-focused element on close. All of
 * this is suspended while `isSubmitting` is `true` so an in-flight save can't be interrupted.
 *
 * Colors come entirely from design tokens (src/styles/tokens.css) — no hardcoded palette
 * classes and no `dark:` prefixes needed.
 *
 * @example
 * <FormDialog
 *   isOpen={isOpen}
 *   onClose={closeDialog}
 *   title="Add Vendor"
 *   description="Vendors appear in the connectivity picker for every tenant."
 *   onSubmit={handleSubmit}
 *   isSubmitting={isSaving}
 *   error={submitError}
 * >
 *   <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
 * </FormDialog>
 */
export const FormDialog: React.FC<FormDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitText = 'Save',
  cancelText = 'Cancel',
  isSubmitting = false,
  error = null,
  size = 'md',
  disableBackdropClose = false,
  submitDisabled = false,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  const requestClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleBackdropClick = () => {
    if (disableBackdropClose) return;
    requestClose();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 bg-scrim/50 flex items-center justify-center p-4 z-50"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={`bg-surface-overlay rounded-lg shadow-xl w-full ${sizeStyles[size]} focus:outline-none`}
          onClick={(event) => event.stopPropagation()}
        >
          <form onSubmit={handleSubmit} noValidate>
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id={titleId} className="text-lg font-medium text-content-primary">
                  {title}
                </h3>
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-content-secondary">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={requestClose}
                disabled={isSubmitting}
                aria-label="Close dialog"
                className="
                  flex-shrink-0 rounded-md p-1.5 -m-1.5
                  text-content-tertiary hover:text-content-primary hover:bg-surface-hover
                  transition-colors duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-content-tertiary
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-danger-subtle border border-danger/30 rounded-lg px-4 py-3 text-danger-subtle-foreground"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {children}
            </div>

            <div className="px-6 py-4 bg-surface-hover flex justify-end space-x-3 rounded-b-lg">
              <Button type="button" variant="secondary" onClick={requestClose} disabled={isSubmitting}>
                {cancelText}
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={submitDisabled}>
                {submitText}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </OverlayPortal>
  );
};

FormDialog.displayName = 'FormDialog';

export default FormDialog;

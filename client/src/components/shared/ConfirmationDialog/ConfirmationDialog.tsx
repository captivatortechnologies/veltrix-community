import React, { useEffect, useId, useRef } from 'react';
import { ConfirmationState, ConfirmationVariant } from './types';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { OverlayPortal } from '../OverlayPortal';

interface ConfirmationDialogProps {
  confirmation: ConfirmationState | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Get variant-specific styles and icon. Uses design tokens (src/styles/tokens.css) so
// dark mode is automatic — no `dark:` prefixes needed.
const getVariantStyles = (variant: ConfirmationVariant) => {
  switch (variant) {
    case 'danger':
      return {
        icon: <XCircle className="h-6 w-6 text-danger" aria-hidden="true" />,
        confirmButton: 'bg-danger hover:bg-danger-hover focus-visible:ring-danger',
        iconBg: 'bg-danger-subtle',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />,
        confirmButton: 'bg-warning hover:bg-warning-hover focus-visible:ring-warning',
        iconBg: 'bg-warning-subtle',
      };
    case 'info':
      return {
        icon: <Info className="h-6 w-6 text-info" aria-hidden="true" />,
        confirmButton: 'bg-info hover:bg-info-hover focus-visible:ring-info',
        iconBg: 'bg-info-subtle',
      };
  }
};

/**
 * ConfirmationDialog Component
 *
 * Renders the confirmation modal driven by ConfirmationDialogProvider — consume it via
 * `useConfirmDialog()` rather than rendering this directly. Never use `window.confirm()`.
 *
 * Accessible by default: `role="alertdialog"`, labelled by the title, described by the
 * message, closes on Escape, and returns focus to the element that opened it.
 */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  confirmation,
  onConfirm,
  onCancel
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const isOpen = !!confirmation?.isOpen;

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, onCancel]);

  if (!confirmation || !confirmation.isOpen) {
    return null;
  }

  const {
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'warning'
  } = confirmation;

  const variantStyles = getVariantStyles(variant);

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 bg-scrim/50 flex items-center justify-center p-4 z-50"
        onClick={onCancel}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="bg-surface-overlay rounded-lg shadow-xl max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4">
            <div className="flex items-start">
              <div className={`flex-shrink-0 ${variantStyles.iconBg} rounded-full p-2`}>
                {variantStyles.icon}
              </div>
              <div className="ml-4 flex-1">
                <h3 id={titleId} className="text-lg font-medium text-content-primary">
                  {title}
                </h3>
                <div className="mt-2">
                  <p id={descriptionId} className="text-sm text-content-secondary">
                    {message}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 bg-surface-hover flex justify-end space-x-3 rounded-b-lg">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-border rounded-md text-sm font-medium text-content-primary bg-surface-raised hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-content-tertiary"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-4 py-2 rounded-md text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${variantStyles.confirmButton}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
};

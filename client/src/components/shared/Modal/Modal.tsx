import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { OverlayPortal } from '../OverlayPortal';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  /** Controls visibility. Renders nothing when `false`. */
  isOpen: boolean;
  /** Called on backdrop click (unless disabled), Escape, and the X button. */
  onClose: () => void;
  /** Heading rendered at the top of the modal. */
  title?: React.ReactNode;
  /** Secondary line rendered under the title. */
  subtitle?: React.ReactNode;
  /** Modal body. */
  children: React.ReactNode;
  /** Optional footer content (e.g. action buttons), rendered in a tinted bar. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** When true, clicking the backdrop no longer closes the modal. */
  disableBackdropClose?: boolean;
  /** When true, Escape no longer closes the modal. */
  disableEscapeClose?: boolean;
  /** Hide the top-right close (X) button. */
  hideCloseButton?: boolean;
  /** Accessible label for the close button. Defaults to "Close". */
  closeLabel?: string;
  className?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal Component
 *
 * A general-purpose modal shell — the coordinated base for any overlay content
 * (details, wizards, pickers) that isn't a plain form (`FormDialog`) or a yes/no
 * prompt (`ConfirmationDialog`). Provides the standard backdrop, centered panel,
 * a header with `title` + `subtitle` and a close button, a scrollable body, and
 * an optional `footer` bar for actions.
 *
 * Accessible by default: `role="dialog"`, `aria-modal="true"`, labelled by the
 * title, closes on Escape (unless disabled), moves focus into the panel on open,
 * and restores focus to the previously-focused element on close.
 *
 * The overlay is rendered through `OverlayPortal` (at `document.body`) so its
 * `fixed inset-0` backdrop is measured against the viewport and stays centered
 * even when opened from inside an app surface — platform app pages live inside
 * `<main className="overflow-y-auto">`, a containing block that would otherwise
 * pin a non-portaled overlay to the scrolled content region. This matches the
 * portal strategy `FormDialog` and `ConfirmationDialog` already use.
 *
 * Colors come entirely from design tokens (src/styles/tokens.css) — no hardcoded
 * palette classes and no `dark:` prefixes needed. Selects and other popovers
 * rendered inside the body portal above the modal, so their menus are never
 * clipped by the body's scroll area.
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={close}
 *   title="Choose a region"
 *   subtitle="Where should this infrastructure live?"
 *   footer={<Button onClick={close}>Done</Button>}
 * >
 *   <Select label="Region" options={regions} value={region} onChange={setRegion} />
 * </Modal>
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  disableBackdropClose = false,
  disableEscapeClose = false,
  hideCloseButton = false,
  closeLabel = 'Close',
  className = '',
}) => {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableEscapeClose) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, disableEscapeClose, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = () => {
    if (disableBackdropClose) return;
    onClose();
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
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={subtitle ? subtitleId : undefined}
          tabIndex={-1}
          className={`bg-surface-overlay rounded-lg shadow-xl w-full ${sizeStyles[size]} focus:outline-none ${className}`}
          onClick={(event) => event.stopPropagation()}
        >
          {(title || subtitle || !hideCloseButton) && (
            <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title && (
                  <h3 id={titleId} className="text-lg font-medium text-content-primary">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p id={subtitleId} className="mt-1 text-sm text-content-secondary">
                    {subtitle}
                  </p>
                )}
              </div>
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="
                    flex-shrink-0 rounded-md p-1.5 -m-1.5
                    text-content-tertiary hover:text-content-primary hover:bg-surface-hover
                    transition-colors duration-150
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-content-tertiary
                  "
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>

          {footer && (
            <div className="px-6 py-4 bg-surface-hover flex justify-end gap-3 rounded-b-lg">
              {footer}
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
};

Modal.displayName = 'Modal';

export default Modal;

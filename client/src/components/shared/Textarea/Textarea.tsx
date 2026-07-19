import { TextareaHTMLAttributes, forwardRef, useId } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

/**
 * Textarea Component
 *
 * A multi-line text input mirroring {@link Input}'s label / error / helper-text
 * layout. Colors are driven entirely by design tokens (see src/styles/tokens.css) —
 * no hardcoded hex, no `dark:` prefixes — so it themes automatically and picks up an
 * app's brand color via the scoped `--color-primary` family. The error/helper message
 * is wired via `aria-describedby`, and `aria-invalid` is set whenever `error` is present.
 *
 * @example
 * <Textarea
 *   label="Description"
 *   placeholder="Describe the detection…"
 *   helperText="Markdown is supported."
 * />
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = true,
      className = '',
      id,
      disabled,
      rows = 4,
      ...props
    },
    ref
  ) => {
    // Auto-generate an id from the label when none is provided (matches Input).
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    // Stable id for the helper/error message so aria-describedby always resolves.
    const descriptionId = useId();
    const describedBy = error || helperText ? descriptionId : undefined;

    const borderStyles = error
      ? 'border-danger focus:ring-danger focus:border-danger'
      : 'border-border focus:ring-primary focus:border-primary';

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-content-primary mb-1">
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className={`
            block w-full
            rounded-md border
            bg-surface-raised
            text-content-primary
            placeholder-content-tertiary
            focus:outline-none focus:ring-2
            transition-colors duration-200
            disabled:bg-surface-sunken
            disabled:cursor-not-allowed
            disabled:text-content-disabled
            px-3 py-2 text-sm
            ${borderStyles}
            ${className}
          `}
          {...props}
        />

        {error && (
          <p id={descriptionId} className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={descriptionId} className="mt-1 text-sm text-content-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;

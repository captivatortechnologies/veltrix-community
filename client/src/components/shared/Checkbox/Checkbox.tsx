import { InputHTMLAttributes, ReactNode, forwardRef, useId } from 'react';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
}

/**
 * Checkbox Component
 *
 * A styled checkbox with an associated label, optional error and helper text.
 * The native `<input type="checkbox">` is retained (so it works with forms and
 * assistive tech) and tinted with `accent-primary` plus tokenized border/focus
 * styles — all driven by design tokens (see src/styles/tokens.css), so it themes
 * automatically and adopts an app's brand color via the scoped `--color-primary`
 * family. No hardcoded hex, no `dark:` prefixes.
 *
 * @example
 * <Checkbox label="Enable drift detection" defaultChecked />
 *
 * @example
 * <Checkbox label="I accept the terms" error="You must accept to continue" />
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, helperText, className = '', id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    // Stable id for the helper/error message so aria-describedby always resolves.
    const descriptionId = useId();
    const describedBy = error || helperText ? descriptionId : undefined;

    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            className={`
              h-4 w-4 rounded
              border bg-surface-raised
              accent-primary
              focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface
              disabled:cursor-not-allowed disabled:opacity-50
              ${error ? 'border-danger' : 'border-border'}
              ${className}
            `}
            {...props}
          />
          {label && (
            <label
              htmlFor={inputId}
              className={`text-sm text-content-primary ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {label}
            </label>
          )}
        </div>

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

Checkbox.displayName = 'Checkbox';

export default Checkbox;

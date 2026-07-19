import { InputHTMLAttributes, forwardRef, ReactNode, useId } from 'react';
import { AlertCircle, Check } from 'lucide-react';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'default' | 'error' | 'success';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  variant?: InputVariant;
  inputSize?: InputSize;
  isSuccess?: boolean;
  fullWidth?: boolean;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
};

const variantStyles: Record<InputVariant, string> = {
  default: 'border-border focus:ring-primary focus:border-primary',
  error: 'border-danger focus:ring-danger focus:border-danger',
  success: 'border-success focus:ring-success focus:border-success',
};

/**
 * Input Component
 *
 * A fully-featured input component with label, error states, helper text,
 * icons, and full dark mode support (via design tokens — see src/styles/tokens.css).
 * The error/helper message is wired to the input via `aria-describedby`, and
 * `aria-invalid` is set whenever `error` is provided.
 *
 * @example
 * // Basic input with label
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 * />
 *
 * @example
 * // Input with error
 * <Input
 *   label="Password"
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 *
 * @example
 * // Input with icon
 * <Input
 *   label="Search"
 *   leftIcon={<Search size={16} />}
 *   placeholder="Search..."
 * />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      variant: propVariant,
      inputSize = 'md',
      isSuccess = false,
      fullWidth = true,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    // Determine variant based on state
    const variant = error ? 'error' : isSuccess ? 'success' : propVariant || 'default';

    // Auto-generate ID if not provided and label exists
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    // Stable id for the helper/error message, independent of whether `inputId` exists,
    // so aria-describedby always has something to point at.
    const descriptionId = useId();
    const describedBy = error || helperText ? descriptionId : undefined;

    // Show success icon if isSuccess is true and no right icon provided
    const displayRightIcon = error ? (
      <AlertCircle className="text-danger" size={16} aria-hidden="true" />
    ) : isSuccess && !rightIcon ? (
      <Check className="text-success" size={16} aria-hidden="true" />
    ) : (
      rightIcon
    );

    return (
      <div className={`${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-content-primary mb-1"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-content-tertiary">{leftIcon}</span>
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
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
              ${sizeStyles[inputSize]}
              ${variantStyles[variant]}
              ${leftIcon ? 'pl-10' : ''}
              ${displayRightIcon ? 'pr-10' : ''}
              ${className}
            `}
            {...props}
          />

          {displayRightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              {displayRightIcon}
            </div>
          )}
        </div>

        {error && (
          <p id={descriptionId} className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={descriptionId} className="mt-1 text-sm text-content-secondary">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

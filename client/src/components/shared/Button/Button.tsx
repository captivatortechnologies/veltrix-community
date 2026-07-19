import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-primary hover:bg-primary-hover active:bg-primary-active
    text-primary-foreground
    border border-transparent
    shadow-sm hover:shadow-md
  `,
  secondary: `
    bg-surface-hover hover:bg-border active:bg-border-strong
    text-content-primary
    border border-border
    shadow-sm hover:shadow-md
  `,
  danger: `
    bg-danger hover:bg-danger-hover active:bg-danger-active
    text-danger-foreground
    border border-transparent
    shadow-sm hover:shadow-md
  `,
  success: `
    bg-success hover:bg-success-hover active:bg-success-active
    text-success-foreground
    border border-transparent
    shadow-sm hover:shadow-md
  `,
  warning: `
    bg-warning hover:bg-warning-hover active:bg-warning-active
    text-warning-foreground
    border border-transparent
    shadow-sm hover:shadow-md
  `,
  ghost: `
    bg-transparent hover:bg-surface-hover active:bg-border
    text-content-secondary
    border border-transparent
  `,
  link: `
    bg-transparent hover:bg-transparent active:bg-transparent
    text-primary hover:text-primary-hover active:text-primary-active
    border border-transparent
    underline-offset-4 hover:underline
    shadow-none
  `,
};

// Keyboard-focus ring color per variant (focus-visible only — no ring on mouse click).
const focusRingStyles: Record<ButtonVariant, string> = {
  primary: 'focus-visible:ring-primary',
  secondary: 'focus-visible:ring-content-tertiary',
  danger: 'focus-visible:ring-danger',
  success: 'focus-visible:ring-success',
  warning: 'focus-visible:ring-warning',
  ghost: 'focus-visible:ring-content-tertiary',
  link: 'focus-visible:ring-primary',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

/**
 * Button Component
 *
 * A fully-featured button component with multiple variants, sizes, loading states,
 * and full dark mode support. Colors are driven entirely by design tokens
 * (see src/styles/tokens.css / tailwind.config.js) — no hardcoded palette classes and
 * no `dark:` prefixes needed for brand color, since the underlying CSS variables flip.
 * Focus rings only appear on keyboard focus (`focus-visible`), and `disabled`/`isLoading`
 * both dim the button and set `aria-busy` appropriately.
 *
 * @example
 * // Primary button
 * <Button variant="primary">Save Changes</Button>
 *
 * @example
 * // Button with loading state
 * <Button variant="primary" isLoading loadingText="Saving...">
 *   Save
 * </Button>
 *
 * @example
 * // Button with icon
 * <Button variant="danger" leftIcon={<Trash2 size={16} />}>
 *   Delete
 * </Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      fullWidth = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={`
          inline-flex items-center justify-center
          font-medium
          rounded-md
          transition-all duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface
          disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
          ${variantStyles[variant]}
          ${focusRingStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
            {loadingText || children}
          </>
        ) : (
          <>
            {leftIcon && <span className="mr-2 flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="ml-2 flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

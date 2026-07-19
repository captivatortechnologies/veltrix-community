import React, { HTMLAttributes } from 'react';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  rounded?: boolean;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-content-primary',
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  secondary: 'bg-surface-hover text-content-secondary',
  success: 'bg-success-subtle text-success-subtle-foreground',
  danger: 'bg-danger-subtle text-danger-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  info: 'bg-info-subtle text-info-subtle-foreground',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm',
  lg: 'px-3 py-1 text-base',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-content-tertiary',
  primary: 'bg-primary',
  secondary: 'bg-content-tertiary',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

/**
 * Badge Component
 *
 * A versatile badge component for displaying status, labels, or counts. Colors are
 * driven by design tokens (src/styles/tokens.css) and require no `dark:` prefixes —
 * the token itself resolves to the correct light/dark value.
 *
 * @example
 * // Basic badge
 * <Badge>New</Badge>
 *
 * @example
 * // Status badge
 * <Badge variant="success">Active</Badge>
 *
 * @example
 * // Badge with dot
 * <Badge variant="danger" dot>Offline</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  rounded = false,
  dot = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <span
      className={`
        inline-flex items-center font-medium
        ${rounded ? 'rounded-full' : 'rounded-md'}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {dot && (
        <span
          className={`
            w-2 h-2 rounded-full mr-1.5
            ${dotStyles[variant]}
          `}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';

export default Badge;

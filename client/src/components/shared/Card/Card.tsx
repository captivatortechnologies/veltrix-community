import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered';
}

const variantStyles = {
  default: 'bg-surface-raised shadow-md',
  bordered: 'bg-surface-raised border border-border',
  elevated: 'bg-surface-raised shadow-lg hover:shadow-xl transition-shadow',
};

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/**
 * Card Component
 *
 * A flexible card container with header, body, and footer sections. Surface and border
 * colors come from design tokens (bg-surface-raised, border-border, …) so dark mode is
 * automatic — no `dark:` prefixes needed in consumers.
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <h3>Card Title</h3>
 *   </CardHeader>
 *   <CardBody>
 *     <p>Card content goes here</p>
 *   </CardBody>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 */
export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'none',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        rounded-lg overflow-hidden
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * CardHeader Component
 *
 * Header section of a card with optional actions.
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  actions,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        px-6 py-4
        border-b border-border
        ${actions ? 'flex items-center justify-between' : ''}
        ${className}
      `}
      {...props}
    >
      <div className="flex-1">{children}</div>
      {actions && <div className="ml-4 flex-shrink-0">{actions}</div>}
    </div>
  );
};

/**
 * CardBody Component
 *
 * Main content area of a card.
 */
export const CardBody: React.FC<CardBodyProps> = ({ className = '', children, ...props }) => {
  return (
    <div className={`px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
};

/**
 * CardFooter Component
 *
 * Footer section of a card, typically for actions.
 */
export const CardFooter: React.FC<CardFooterProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const footerVariantStyles = {
    default: 'bg-surface-hover',
    bordered: 'bg-surface-raised border-t border-border',
  };

  return (
    <div
      className={`
        px-6 py-4
        ${footerVariantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

Card.displayName = 'Card';
CardHeader.displayName = 'CardHeader';
CardBody.displayName = 'CardBody';
CardFooter.displayName = 'CardFooter';

export default Card;

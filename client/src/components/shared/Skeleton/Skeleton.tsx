import React, { HTMLAttributes } from 'react';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Skeleton Component
 *
 * A skeleton loading component for better perceived performance. Rendered as
 * `aria-hidden="true"` by default since it is purely decorative — wrap a group of
 * skeletons in an element with `role="status"` / `aria-label="Loading"` (or reuse
 * `LoadingSpinner`) so assistive tech announces the loading state itself.
 *
 * @example
 * // Text skeleton
 * <Skeleton variant="text" width="200px" />
 *
 * @example
 * // Avatar skeleton
 * <Skeleton variant="circular" width={40} height={40} />
 *
 * @example
 * // Card skeleton
 * <Skeleton variant="rectangular" height={200} />
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className = '',
  style,
  ...props
}) => {
  const variantStyles = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-surface-hover via-border to-surface-hover bg-[length:200%_100%]',
    none: '',
  };

  const computedStyle = {
    ...style,
    ...(width && { width: typeof width === 'number' ? `${width}px` : width }),
    ...(height && { height: typeof height === 'number' ? `${height}px` : height }),
  };

  return (
    <div
      className={`
        bg-surface-hover
        ${variantStyles[variant]}
        ${animationStyles[animation]}
        ${className}
      `}
      style={computedStyle}
      aria-hidden="true"
      {...props}
    />
  );
};

/**
 * SkeletonText Component
 *
 * Convenience component for text skeletons with multiple lines.
 */
export interface SkeletonTextProps {
  lines?: number;
  width?: string | number;
  lastLineWidth?: string | number;
  className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  width = '100%',
  lastLineWidth = '80%',
  className = '',
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === lines - 1 ? lastLineWidth : width}
        />
      ))}
    </div>
  );
};

/**
 * SkeletonCard Component
 *
 * Convenience component for card skeletons.
 */
export interface SkeletonCardProps {
  hasAvatar?: boolean;
  hasActions?: boolean;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  hasAvatar = false,
  hasActions = false,
  className = '',
}) => {
  return (
    <div className={`bg-surface-raised rounded-lg p-6 ${className}`} aria-hidden="true">
      <div className="flex items-start space-x-4">
        {hasAvatar && <Skeleton variant="circular" width={48} height={48} />}
        <div className="flex-1 space-y-3">
          <Skeleton variant="text" width="60%" />
          <SkeletonText lines={2} />
        </div>
      </div>
      {hasActions && (
        <div className="mt-4 flex space-x-2">
          <Skeleton variant="rectangular" width={80} height={36} />
          <Skeleton variant="rectangular" width={80} height={36} />
        </div>
      )}
    </div>
  );
};

Skeleton.displayName = 'Skeleton';
SkeletonText.displayName = 'SkeletonText';
SkeletonCard.displayName = 'SkeletonCard';

export default Skeleton;

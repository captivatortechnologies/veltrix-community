import React from 'react';
import { Loader2 } from 'lucide-react';

export type LoadingSpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
export type LoadingSpinnerVariant = 'default' | 'overlay';

export interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  variant?: LoadingSpinnerVariant;
  text?: string;
  className?: string;
}

const sizeStyles: Record<LoadingSpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

/**
 * LoadingSpinner Component
 *
 * A loading spinner component with optional text and overlay mode.
 *
 * @example
 * // Basic spinner
 * <LoadingSpinner />
 *
 * @example
 * // Spinner with text
 * <LoadingSpinner text="Loading..." size="lg" />
 *
 * @example
 * // Overlay spinner (full screen)
 * <LoadingSpinner variant="overlay" text="Processing..." />
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  text,
  className = '',
}) => {
  const spinner = (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <Loader2
        className={`
          ${sizeStyles[size]}
          animate-spin
          text-blue-600 dark:text-blue-400
        `}
      />
      {text && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{text}</p>
      )}
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div
        className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50"
        role="status"
        aria-live="polite"
      >
        {spinner}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite">
      {spinner}
    </div>
  );
};

LoadingSpinner.displayName = 'LoadingSpinner';

export default LoadingSpinner;

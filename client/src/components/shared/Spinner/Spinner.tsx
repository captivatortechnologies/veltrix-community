import React from 'react';
import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

/**
 * Spinner Component
 *
 * A minimal, tokenized loading indicator. The spinner tints with `text-primary`
 * (driven by design tokens — see src/styles/tokens.css) so it themes automatically
 * and adopts an app's brand color via the scoped `--color-primary` family. No
 * hardcoded palette classes, no `dark:` prefixes.
 *
 * This is the design-system spinner exposed to app bundles as `Spinner`; the older
 * `components/ui/LoadingSpinner.tsx` (with overlay/text variants) is left untouched.
 *
 * @example
 * <Spinner />
 *
 * @example
 * <Spinner size="lg" label="Loading indexes…" />
 */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '', label }) => (
  <div className="flex flex-col items-center justify-center" role="status" aria-live="polite">
    <Loader2 className={`${sizeStyles[size]} animate-spin text-primary ${className}`} aria-hidden="true" />
    {label ? (
      // Visible label doubles as the accessible status text.
      <p className="mt-2 text-sm text-content-secondary">{label}</p>
    ) : (
      // No visible label — keep the status announceable with a hidden fallback.
      <span className="sr-only">Loading</span>
    )}
  </div>
);

Spinner.displayName = 'Spinner';

export default Spinner;

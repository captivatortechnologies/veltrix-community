import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  /** Severity — drives color and default icon. Defaults to `info`. */
  variant?: AlertVariant;
  /** Optional bold heading above the message. */
  title?: React.ReactNode;
  /** The message body. */
  children?: React.ReactNode;
  /** Override the default icon, or pass `false` to hide it. */
  icon?: React.ReactNode | false;
  /** When provided, renders a dismiss (X) button that calls this. */
  onDismiss?: () => void;
  /** Optional trailing action (e.g. a link or button). */
  action?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<AlertVariant, { container: string; icon: string }> = {
  info: {
    container: 'bg-info-subtle border-info/30 text-info-subtle-foreground',
    icon: 'text-info',
  },
  success: {
    container: 'bg-success-subtle border-success/30 text-success-subtle-foreground',
    icon: 'text-success',
  },
  warning: {
    container: 'bg-warning-subtle border-warning/30 text-warning-subtle-foreground',
    icon: 'text-warning',
  },
  danger: {
    container: 'bg-danger-subtle border-danger/30 text-danger-subtle-foreground',
    icon: 'text-danger',
  },
};

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  info: <Info className="h-4 w-4" aria-hidden="true" />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  danger: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
};

/**
 * Alert Component
 *
 * An inline, static severity banner — for warnings, errors, tips and success
 * notices rendered in the page/form body (not a transient toast — use
 * `useToast` for those). Provides a variant-colored container, a matching
 * leading icon, an optional bold `title`, the message, an optional trailing
 * `action`, and an optional dismiss button (when `onDismiss` is given).
 *
 * `role` is `alert` for `warning`/`danger` (assertive) and `status` for
 * `info`/`success` (polite), so screen readers announce it appropriately.
 * Colors come from design tokens (src/styles/tokens.css) — no `dark:` prefixes.
 *
 * @example
 * <Alert variant="warning" title="Heads up">
 *   Distributed deployments need at least 3 indexers.
 * </Alert>
 */
export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  icon,
  onDismiss,
  action,
  className = '',
}) => {
  const styles = variantStyles[variant];
  const showIcon = icon !== false;
  const role = variant === 'danger' || variant === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 ${styles.container} ${className}`}
    >
      {showIcon && (
        <span className={`mt-0.5 flex-shrink-0 ${styles.icon}`}>
          {icon ?? defaultIcons[variant]}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {children && <div className={`text-sm ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="
            -m-1 flex-shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100
            focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-current
          "
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

Alert.displayName = 'Alert';

export default Alert;

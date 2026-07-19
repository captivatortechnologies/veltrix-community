import React, { type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { Card } from '../Card';
import { Skeleton } from '../Skeleton';

export type StatsCardVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface StatsCardDelta {
  /** Formatted change value, e.g. "+12.5%" */
  value: string;
  /** Determines color + icon so the direction never relies on color alone. */
  direction: 'up' | 'down' | 'neutral';
  /** Optional comparison context, e.g. "vs last month" */
  label?: string;
}

export interface StatsCardProps {
  /** Metric name, e.g. "Active Sandboxes" */
  label: string;
  /** Headline number/value. Rendered as-is (large, bold) — pass a formatted string or node. */
  value: React.ReactNode;
  /** Rendered inside a tinted square sized to match the variant. */
  icon?: React.ReactNode;
  delta?: StatsCardDelta;
  /** Tints the icon container. Defaults to a neutral surface tint. */
  variant?: StatsCardVariant;
  /** Shows skeleton placeholders in place of the value/delta while data is loading. */
  isLoading?: boolean;
  /** When set, the whole card becomes focusable and keyboard-activatable (Enter/Space). */
  onClick?: () => void;
  className?: string;
}

const iconVariantStyles: Record<StatsCardVariant, string> = {
  default: 'bg-surface-hover text-content-secondary',
  primary: 'bg-primary-subtle text-primary-subtle-foreground',
  success: 'bg-success-subtle text-success-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  danger: 'bg-danger-subtle text-danger-subtle-foreground',
  info: 'bg-info-subtle text-info-subtle-foreground',
};

const deltaDirectionConfig: Record<
  StatsCardDelta['direction'],
  { textStyle: string; Icon: LucideIcon }
> = {
  up: { textStyle: 'text-success', Icon: TrendingUp },
  down: { textStyle: 'text-danger', Icon: TrendingDown },
  neutral: { textStyle: 'text-content-secondary', Icon: Minus },
};

/**
 * StatsCard Component
 *
 * A metric/KPI tile for dashboards and summary rows: a label, a large headline value, an
 * optional variant-tinted icon, and an optional trend delta. Colors are driven entirely by
 * design tokens (src/styles/tokens.css) — no hardcoded palette classes and no `dark:`
 * prefixes needed, since the underlying CSS variables flip with the theme.
 *
 * Trend direction never relies on color alone — each direction pairs a semantic color with
 * a distinct icon (TrendingUp / TrendingDown / Minus), so the meaning survives grayscale or
 * color-blind viewing.
 *
 * When `onClick` is provided the card becomes a keyboard-accessible button (WAI-ARIA button
 * pattern: `role="button"`, `tabIndex={0}`, Enter/Space activation) so it can be used as a
 * clickable KPI that drills into a detail view. Without `onClick` it renders as a static,
 * non-interactive card.
 *
 * @example
 * <StatsCard
 *   label="Active Sandboxes"
 *   value={128}
 *   icon={<FlaskConical size={20} />}
 *   variant="primary"
 *   delta={{ value: '+12.5%', direction: 'up', label: 'vs last month' }}
 * />
 *
 * @example Loading state
 * <StatsCard label="Active Sandboxes" value={0} isLoading />
 *
 * @example Clickable, drills into a detail view
 * <StatsCard label="Failed Deployments" value={3} variant="danger" onClick={() => navigate('/deployments?status=failed')} />
 */
export const StatsCard: React.FC<StatsCardProps> = ({
  label,
  value,
  icon,
  delta,
  variant = 'default',
  isLoading = false,
  onClick,
  className = '',
}) => {
  const isClickable = Boolean(onClick);
  const deltaConfig = delta ? deltaDirectionConfig[delta.direction] : null;
  const DeltaIcon = deltaConfig?.Icon;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      variant="bordered"
      padding="md"
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      className={`
        ${isClickable ? 'cursor-pointer text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface' : ''}
        ${className}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content-secondary">{label}</p>

          {isLoading ? (
            <Skeleton variant="text" width={96} height={30} className="mt-2" />
          ) : (
            <p className="mt-1 text-3xl font-bold leading-tight text-content-primary">{value}</p>
          )}

          {delta &&
            (isLoading ? (
              <Skeleton variant="text" width={80} height={16} className="mt-2" />
            ) : (
              <div className={`mt-2 flex items-center gap-1 text-sm ${deltaConfig!.textStyle}`}>
                {DeltaIcon && <DeltaIcon size={14} className="flex-shrink-0" aria-hidden="true" />}
                <span className="font-medium">{delta.value}</span>
                {delta.label && <span className="text-content-tertiary">{delta.label}</span>}
              </div>
            ))}
        </div>

        {icon && (
          <div
            className={`
              flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg
              ${iconVariantStyles[variant]}
            `}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

StatsCard.displayName = 'StatsCard';

export default StatsCard;

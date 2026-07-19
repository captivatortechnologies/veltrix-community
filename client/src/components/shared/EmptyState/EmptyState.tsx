import React, { ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState Component
 *
 * A consistent empty state component for displaying when no data is available.
 * Text/icon colors come from design tokens and adapt to dark mode automatically.
 *
 * @example
 * <EmptyState
 *   icon={<Users size={48} />}
 *   title="No users found"
 *   description="Get started by adding your first user."
 *   action={<Button onClick={handleAdd}>Add User</Button>}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        text-center
        py-12 px-4
        ${className}
      `}
    >
      <div className="text-content-tertiary mb-4">
        {icon || <FileQuestion size={48} aria-hidden="true" />}
      </div>

      <h3 className="text-lg font-semibold text-content-primary mb-2">
        {title}
      </h3>

      {description && (
        <p className="text-sm text-content-secondary max-w-md mb-6">
          {description}
        </p>
      )}

      {action && <div>{action}</div>}
    </div>
  );
};

EmptyState.displayName = 'EmptyState';

export default EmptyState;

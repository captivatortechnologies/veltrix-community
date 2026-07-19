import React from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

interface ReportStatusProps {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  /** When true (and not loading/error), show the empty state instead of children. */
  isEmpty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

/**
 * Shared loading / error / empty gate for the Reports pages. Renders `children`
 * only once real data has loaded, so no report ever shows fabricated content.
 */
export const ReportStatus: React.FC<ReportStatusProps> = ({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyMessage = 'No data available yet for this report.',
  onRetry,
  children,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" text="Loading report…" />
      </div>
    );
  }

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Something went wrong loading this report.';
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Failed to load report</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="w-10 h-10 text-gray-400 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default ReportStatus;

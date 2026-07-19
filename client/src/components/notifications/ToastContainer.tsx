/**
 * Toast Notification
 * 
 * Displays toast notification with auto-dismiss.
 */

import React from 'react';
import { useToasts, NotificationType } from '../../stores';

const typeStyles: Record<NotificationType, { bg: string; icon: string; border: string }> = {
  [NotificationType.INFO]: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'ℹ️',
    border: 'border-blue-500',
  },
  [NotificationType.SUCCESS]: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    icon: '✅',
    border: 'border-green-500',
  },
  [NotificationType.WARNING]: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    icon: '⚠️',
    border: 'border-yellow-500',
  },
  [NotificationType.ERROR]: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: '❌',
    border: 'border-red-500',
  },
};

export const ToastContainer: React.FC = () => {
  const { toasts, hideToast } = useToasts();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((toast) => {
        const styles = typeStyles[toast.type];
        
        return (
          <div
            key={toast.id}
            className={`${styles.bg} border-l-4 ${styles.border} rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in`}
          >
            <span className="text-xl">{styles.icon}</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {toast.title}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {toast.message}
              </p>
              {toast.action && (
                <button
                  onClick={toast.action.onClick}
                  className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              onClick={() => hideToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;

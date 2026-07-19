import React, { createContext, useState, useCallback } from 'react';
import { Toast, ToastOptions, ToastContextValue } from './types';
import { ToastContainer } from './ToastContainer';

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const generateId = useCallback(() => {
    return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const toast = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = generateId();
      const newToast: Toast = {
        id,
        message,
        variant: options?.variant || 'info',
        duration: options?.duration ?? 5000, // Default 5 seconds
        action: options?.action,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    [generateId]
  );

  const success = useCallback(
    (message: string, duration?: number): string => {
      return toast(message, { variant: 'success', duration });
    },
    [toast]
  );

  const error = useCallback(
    (message: string, duration?: number): string => {
      return toast(message, { variant: 'error', duration });
    },
    [toast]
  );

  const warning = useCallback(
    (message: string, duration?: number): string => {
      return toast(message, { variant: 'warning', duration });
    },
    [toast]
  );

  const info = useCallback(
    (message: string, duration?: number): string => {
      return toast(message, { variant: 'info', duration });
    },
    [toast]
  );

  const promise = useCallback(
    async <T,>(
      promiseToResolve: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((error: any) => string);
      }
    ): Promise<T> => {
      const loadingId = toast(messages.loading, { variant: 'info', duration: 0 });

      try {
        const data = await promiseToResolve;
        dismiss(loadingId);
        const successMessage =
          typeof messages.success === 'function' ? messages.success(data) : messages.success;
        success(successMessage);
        return data;
      } catch (err) {
        dismiss(loadingId);
        const errorMessage = typeof messages.error === 'function' ? messages.error(err) : messages.error;
        error(errorMessage);
        throw err;
      }
    },
    [toast, success, error]
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value: ToastContextValue = {
    toasts,
    toast,
    success,
    error,
    warning,
    info,
    promise,
    dismiss,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

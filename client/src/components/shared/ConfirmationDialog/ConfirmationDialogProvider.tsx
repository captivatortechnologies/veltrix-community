import React, { createContext, useState, useCallback } from 'react';
import { ConfirmationDialogContextValue, ConfirmationOptions, ConfirmationState } from './types';
import { ConfirmationDialog } from './ConfirmationDialog';

export const ConfirmationDialogContext = createContext<ConfirmationDialogContextValue | undefined>(
  undefined
);

interface ConfirmationDialogProviderProps {
  children: React.ReactNode;
}

export const ConfirmationDialogProvider: React.FC<ConfirmationDialogProviderProps> = ({
  children
}) => {
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);

  const confirm = useCallback((options: ConfirmationOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).substr(2, 9);

      setConfirmation({
        ...options,
        id,
        isOpen: true,
        resolve
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirmation) {
      confirmation.resolve(true);
      setConfirmation(null);
    }
  }, [confirmation]);

  const handleCancel = useCallback(() => {
    if (confirmation) {
      confirmation.resolve(false);
      setConfirmation(null);
    }
  }, [confirmation]);

  const contextValue: ConfirmationDialogContextValue = {
    confirm
  };

  return (
    <ConfirmationDialogContext.Provider value={contextValue}>
      {children}
      <ConfirmationDialog
        confirmation={confirmation}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmationDialogContext.Provider>
  );
};

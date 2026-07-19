import { useContext } from 'react';
import { ConfirmationDialogContext } from './ConfirmationDialogProvider';
import { ConfirmationDialogContextValue } from './types';

export const useConfirmDialog = (): ConfirmationDialogContextValue => {
  const context = useContext(ConfirmationDialogContext);

  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmationDialogProvider');
  }

  return context;
};

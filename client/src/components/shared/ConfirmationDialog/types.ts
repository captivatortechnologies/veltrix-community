export type ConfirmationVariant = 'danger' | 'warning' | 'info';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmationVariant;
}

export interface ConfirmationState extends ConfirmationOptions {
  id: string;
  isOpen: boolean;
  resolve: (value: boolean) => void;
}

export interface ConfirmationDialogContextValue {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

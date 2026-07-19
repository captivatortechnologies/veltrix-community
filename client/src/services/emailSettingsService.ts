import { authAxios } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export type EmailProviderChoice = 'smtp' | 'ses';

export interface EmailSettingsView {
  provider: EmailProviderChoice;
  enabled: boolean;
  fromAddress: string | null;
  fromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
  sesRegion: string | null;
  sesAccessKeyId: string | null;
  hasSesSecret: boolean;
  activeSource: 'db' | 'env' | 'none';
  activeProvider: 'smtp' | 'ses' | 'none';
}

export interface EmailSettingsInput {
  provider: EmailProviderChoice;
  enabled: boolean;
  fromAddress?: string;
  fromName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  /** Blank keeps the currently-stored password. */
  smtpPassword?: string;
  sesRegion?: string;
  sesAccessKeyId?: string;
  /** Blank keeps the currently-stored secret. */
  sesSecretAccessKey?: string;
}

export interface TestEmailResult {
  delivered: boolean;
  provider: string;
  message: string;
}

export const getEmailSettings = async (): Promise<EmailSettingsView> => {
  const response = await authAxios.get(`${API_URL}/email-settings`);
  return response.data;
};

export const updateEmailSettings = async (input: EmailSettingsInput): Promise<EmailSettingsView> => {
  const response = await authAxios.put(`${API_URL}/email-settings`, input);
  return response.data;
};

export const sendTestEmail = async (input: EmailSettingsInput & { to: string }): Promise<TestEmailResult> => {
  const response = await authAxios.post(`${API_URL}/email-settings/test`, input);
  return response.data;
};

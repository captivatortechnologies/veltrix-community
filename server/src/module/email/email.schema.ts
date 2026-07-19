// ========================================================================
// Email settings schemas (admin UI: GET/PUT /email-settings, POST test).
//
// Secrets are WRITE-ONLY across this API: the client may send smtpPassword /
// sesSecretAccessKey to set them, but they are never returned. Reads expose
// only `hasSmtpPassword` / `hasSesSecret` booleans so the UI can show whether a
// secret is on record without ever revealing it.
// ========================================================================

export type EmailProviderChoice = 'smtp' | 'ses';

export interface EmailSettingsInput {
  provider: EmailProviderChoice;
  enabled: boolean;
  fromAddress?: string;
  fromName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  /** Omitted or blank => keep the currently-stored password. */
  smtpPassword?: string;
  sesRegion?: string;
  sesAccessKeyId?: string;
  /** Omitted or blank => keep the currently-stored secret. */
  sesSecretAccessKey?: string;
}

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
  /** Where email is actually resolved from right now (db overrides env). */
  activeSource: 'db' | 'env' | 'none';
  activeProvider: 'smtp' | 'ses' | 'none';
}

export interface TestEmailInput extends EmailSettingsInput {
  to: string;
}

export const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const;

export const emailSettingsInputSchema = {
  type: 'object',
  required: ['provider', 'enabled'],
  properties: {
    provider: { type: 'string', enum: ['smtp', 'ses'] },
    enabled: { type: 'boolean' },
    fromAddress: { type: 'string', maxLength: 320 },
    fromName: { type: 'string', maxLength: 128 },
    smtpHost: { type: 'string', maxLength: 255 },
    smtpPort: { type: 'integer', minimum: 1, maximum: 65535 },
    smtpSecure: { type: 'boolean' },
    smtpUser: { type: 'string', maxLength: 255 },
    smtpPassword: { type: 'string', maxLength: 1024 },
    sesRegion: { type: 'string', maxLength: 64 },
    sesAccessKeyId: { type: 'string', maxLength: 128 },
    sesSecretAccessKey: { type: 'string', maxLength: 1024 },
  },
} as const;

export const emailSettingsViewSchema = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    enabled: { type: 'boolean' },
    fromAddress: { type: 'string', nullable: true },
    fromName: { type: 'string', nullable: true },
    smtpHost: { type: 'string', nullable: true },
    smtpPort: { type: 'integer', nullable: true },
    smtpSecure: { type: 'boolean' },
    smtpUser: { type: 'string', nullable: true },
    hasSmtpPassword: { type: 'boolean' },
    sesRegion: { type: 'string', nullable: true },
    sesAccessKeyId: { type: 'string', nullable: true },
    hasSesSecret: { type: 'boolean' },
    activeSource: { type: 'string' },
    activeProvider: { type: 'string' },
  },
} as const;

export const testEmailInputSchema = {
  type: 'object',
  required: ['to', 'provider', 'enabled'],
  properties: {
    ...emailSettingsInputSchema.properties,
    to: { type: 'string', format: 'email' },
  },
} as const;

export const testEmailResultSchema = {
  type: 'object',
  properties: {
    delivered: { type: 'boolean' },
    provider: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

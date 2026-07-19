import prisma from '../../db';
import { encrypt, decrypt } from '../../utils/encryption';
import { resolveEmailConfig, type ResolvedEmailConfig } from './email.config';
import type { EmailSettingsInput, EmailSettingsView } from './email.schema';

// Secrets are omitted from the client input to KEEP the existing stored value.
function keepOrEncrypt(next: string | undefined, existingEncrypted: string | null): string | null {
  if (next === undefined || next === '') return existingEncrypted; // keep existing
  return encrypt(next);
}

function fromHeader(name: string | null, addr: string | null): string {
  const a = (addr || '').trim();
  if (!a) return '';
  const n = (name || '').trim();
  return n ? `${n} <${a}>` : a;
}

export const emailSettingsService = {
  /** Redacted, admin-facing view of the current settings + resolved status. */
  async getView(): Promise<EmailSettingsView> {
    const row = await prisma.emailSettings.findFirst();
    const resolved = await resolveEmailConfig();
    return {
      provider: (row?.provider as 'smtp' | 'ses') || 'smtp',
      enabled: row?.enabled ?? false,
      fromAddress: row?.fromAddress ?? null,
      fromName: row?.fromName ?? null,
      smtpHost: row?.smtpHost ?? null,
      smtpPort: row?.smtpPort ?? null,
      smtpSecure: row?.smtpSecure ?? false,
      smtpUser: row?.smtpUser ?? null,
      hasSmtpPassword: !!row?.smtpPassword,
      sesRegion: row?.sesRegion ?? null,
      sesAccessKeyId: row?.sesAccessKeyId ?? null,
      hasSesSecret: !!row?.sesSecretAccessKey,
      activeSource: resolved.source,
      activeProvider: resolved.provider,
    };
  },

  /** Upsert the singleton row. Secret fields left blank keep their stored value. */
  async update(input: EmailSettingsInput): Promise<EmailSettingsView> {
    const existing = await prisma.emailSettings.findFirst();

    const data = {
      provider: input.provider,
      enabled: input.enabled,
      fromAddress: input.fromAddress ?? null,
      fromName: input.fromName ?? null,
      smtpHost: input.smtpHost ?? null,
      smtpPort: input.smtpPort ?? null,
      smtpSecure: input.smtpSecure ?? false,
      smtpUser: input.smtpUser ?? null,
      smtpPassword: keepOrEncrypt(input.smtpPassword, existing?.smtpPassword ?? null),
      sesRegion: input.sesRegion ?? null,
      sesAccessKeyId: input.sesAccessKeyId ?? null,
      sesSecretAccessKey: keepOrEncrypt(input.sesSecretAccessKey, existing?.sesSecretAccessKey ?? null),
    };

    if (existing) {
      await prisma.emailSettings.update({ where: { id: existing.id }, data });
    } else {
      await prisma.emailSettings.create({ data });
    }
    return this.getView();
  },

  /**
   * Build a ResolvedEmailConfig from posted (possibly unsaved) input for the
   * "Send test email" button. A blank secret in the input reuses the stored,
   * decrypted secret so an admin can test without re-typing the password.
   */
  async buildConfigFromInput(input: EmailSettingsInput): Promise<ResolvedEmailConfig> {
    const existing = await prisma.emailSettings.findFirst();
    const from = fromHeader(input.fromName ?? null, input.fromAddress ?? null) || undefined;

    if (input.provider === 'smtp') {
      const encPass = keepOrEncrypt(input.smtpPassword, existing?.smtpPassword ?? null);
      return {
        provider: 'smtp',
        from: from || 'Veltrix <no-reply@localhost>',
        smtp: {
          host: input.smtpHost || '',
          port: input.smtpPort ?? 587,
          secure: input.smtpSecure ?? false,
          user: input.smtpUser || undefined,
          pass: encPass ? decrypt(encPass) : undefined,
        },
        source: 'db',
      };
    }

    const encSecret = keepOrEncrypt(input.sesSecretAccessKey, existing?.sesSecretAccessKey ?? null);
    return {
      provider: 'ses',
      from: from || 'Veltrix <no-reply@localhost>',
      ses: {
        region: input.sesRegion || '',
        accessKeyId: input.sesAccessKeyId || undefined,
        secretAccessKey: encSecret ? decrypt(encSecret) : undefined,
      },
      source: 'db',
    };
  },
};

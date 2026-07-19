import { env } from '../../config/env';
import prisma from '../../db';
import { decrypt } from '../../utils/encryption';
import { loggerService } from '../logger/logger.service';

// ---------------------------------------------------------------------------
// Email configuration resolution.
//
// Outbound email can be configured two ways, in this precedence order:
//   1. The admin UI  -> the single `EmailSettings` DB row (secrets encrypted at
//      rest). Used when it exists AND `enabled = true`.
//   2. Environment   -> EMAIL_PROVIDER + SMTP_* / SES_* (see config/env.ts).
//
// If neither yields a usable provider, `provider` is `none` and callers fall
// back to logging the message (so a self-hoster can still recover accounts).
// New providers plug in here without touching the send path in email.service.
// ---------------------------------------------------------------------------

export type EmailProvider = 'smtp' | 'ses' | 'none';

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export interface ResolvedSesConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface ResolvedEmailConfig {
  provider: EmailProvider;
  /** RFC5322 From header, e.g. `Veltrix <no-reply@example.com>`. */
  from: string;
  smtp?: ResolvedSmtpConfig;
  ses?: ResolvedSesConfig;
  /** Where the active config came from — for diagnostics only. */
  source: 'db' | 'env' | 'none';
}

const DEFAULT_FROM = 'Veltrix <no-reply@localhost>';

function fromHeader(name?: string | null, address?: string | null, fallback?: string): string {
  const addr = (address || '').trim();
  if (!addr) return fallback || DEFAULT_FROM;
  const display = (name || '').trim();
  return display ? `${display} <${addr}>` : addr;
}

/**
 * Resolve the active email configuration (DB overrides env). Never throws —
 * on any error it degrades to `{ provider: 'none' }` so a broken email config
 * can never take down login-adjacent flows.
 */
export async function resolveEmailConfig(): Promise<ResolvedEmailConfig> {
  // 1. DB (admin UI) — wins when present and enabled.
  try {
    const row = await prisma.emailSettings.findFirst();
    if (row && row.enabled) {
      if (row.provider === 'smtp' && row.smtpHost) {
        return {
          provider: 'smtp',
          from: fromHeader(row.fromName, row.fromAddress, env.EMAIL_FROM || DEFAULT_FROM),
          smtp: {
            host: row.smtpHost,
            port: row.smtpPort ?? 587,
            secure: row.smtpSecure,
            user: row.smtpUser || undefined,
            pass: row.smtpPassword ? decrypt(row.smtpPassword) : undefined,
          },
          source: 'db',
        };
      }
      if (row.provider === 'ses' && row.sesRegion) {
        return {
          provider: 'ses',
          from: fromHeader(row.fromName, row.fromAddress, env.EMAIL_FROM || DEFAULT_FROM),
          ses: {
            region: row.sesRegion,
            accessKeyId: row.sesAccessKeyId || undefined,
            secretAccessKey: row.sesSecretAccessKey ? decrypt(row.sesSecretAccessKey) : undefined,
          },
          source: 'db',
        };
      }
    }
  } catch (error) {
    // The table may not exist yet (pre-migration) or the DB may be unreachable
    // — fall through to env rather than failing the caller.
    loggerService.debug('resolveEmailConfig: DB lookup skipped/failed, falling back to env', error);
  }

  // 2. Environment.
  if (env.EMAIL_PROVIDER === 'smtp' && env.SMTP_HOST) {
    return {
      provider: 'smtp',
      from: env.EMAIL_FROM || DEFAULT_FROM,
      smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER || undefined,
        pass: env.SMTP_PASS || undefined,
      },
      source: 'env',
    };
  }
  if (env.EMAIL_PROVIDER === 'ses' && env.SES_REGION) {
    return {
      provider: 'ses',
      from: env.EMAIL_FROM || DEFAULT_FROM,
      ses: {
        region: env.SES_REGION,
        accessKeyId: env.SES_ACCESS_KEY_ID || undefined,
        secretAccessKey: env.SES_SECRET_ACCESS_KEY || undefined,
      },
      source: 'env',
    };
  }

  // 3. Nothing configured.
  return { provider: 'none', from: env.EMAIL_FROM || DEFAULT_FROM, source: 'none' };
}

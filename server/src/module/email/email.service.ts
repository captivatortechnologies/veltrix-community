import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { loggerService } from '../logger/logger.service';
import {
  resolveEmailConfig,
  type ResolvedEmailConfig,
  type EmailProvider,
} from './email.config';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  /** true only when a provider actually accepted the message for delivery. */
  delivered: boolean;
  provider: EmailProvider;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Low-level send against an already-resolved config. */
async function sendWith(config: ResolvedEmailConfig, input: SendEmailInput): Promise<SendEmailResult> {
  const text = input.text || stripHtml(input.html);

  if (config.provider === 'smtp' && config.smtp) {
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
    await transporter.sendMail({ from: config.from, to: input.to, subject: input.subject, html: input.html, text });
    return { delivered: true, provider: 'smtp' };
  }

  if (config.provider === 'ses' && config.ses) {
    const ses = new SESClient({
      region: config.ses.region,
      credentials:
        config.ses.accessKeyId && config.ses.secretAccessKey
          ? { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey }
          : undefined, // fall back to the default AWS credential chain (e.g. instance role)
    });
    await ses.send(
      new SendEmailCommand({
        Source: config.from,
        Destination: { ToAddresses: [input.to] },
        Message: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: input.html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      }),
    );
    return { delivered: true, provider: 'ses' };
  }

  // No provider configured — log the message so a self-hoster can still act on
  // it (e.g. copy a password-reset link out of the server log).
  loggerService.warn(
    `[email] No email provider configured — message NOT sent. to=${input.to} subject="${input.subject}"\n${text}`,
  );
  return { delivered: false, provider: 'none' };
}

export const emailService = {
  /** Whether a real provider (SMTP or SES) is currently configured. */
  async isConfigured(): Promise<boolean> {
    const config = await resolveEmailConfig();
    return config.provider !== 'none';
  },

  /** Send using the active (resolved) configuration. Never throws to callers
   *  that don't care about delivery — logs and returns delivered:false. */
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const config = await resolveEmailConfig();
    return sendWith(config, input);
  },

  /**
   * Send a test email against an explicit, not-yet-saved config — powers the
   * admin UI "Send test email" button. Throws on failure so the UI can surface
   * the real provider error.
   */
  async sendTest(config: ResolvedEmailConfig, to: string): Promise<SendEmailResult> {
    if (config.provider === 'none') {
      throw new Error('No email provider is configured.');
    }
    return sendWith(config, {
      to,
      subject: 'Veltrix test email',
      html: '<p>This is a test email from your Veltrix instance. Email delivery is working.</p>',
    });
  },

  /**
   * Send the password-reset email. Best-effort: returns the delivery result but
   * never throws, so the forgot-password endpoint stays uniform (and immune to
   * user-enumeration) regardless of provider state.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string, ttlMinutes: number): Promise<SendEmailResult> {
    const subject = 'Reset your Veltrix password';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111827;">
        <h2 style="color:#1d4ed8;">Reset your password</h2>
        <p>We received a request to reset your Veltrix password. Click the button below to choose a new one.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;display:inline-block;">Reset password</a>
        </p>
        <p style="font-size: 13px; color:#6b7280;">Or paste this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="font-size: 13px; color:#6b7280;">This link expires in ${ttlMinutes} minutes. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
      </div>`;
    const text = `Reset your Veltrix password: ${resetUrl}\nThis link expires in ${ttlMinutes} minutes. If you didn't request this, ignore this email.`;

    try {
      return await this.send({ to, subject, html, text });
    } catch (error) {
      loggerService.error('[email] Failed to send password-reset email:', error);
      return { delivered: false, provider: 'none' };
    }
  },
};

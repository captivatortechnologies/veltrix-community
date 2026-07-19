// ========================================================================
// Two-Factor (TOTP) Service — P6 (B2)
//
// Real TOTP 2FA on top of UserSettings:
//  - `twoFactorPendingSecret` holds a setup-in-progress secret until the
//    user proves possession by verifying a code; only then is it promoted
//    to `twoFactorSecret` and `twoFactorEnabled` flipped on.
//  - Secrets are encrypted at rest with utils/encryption.ts (AES-256-CBC).
//  - Disabling requires a valid TOTP code against the ACTIVE secret — 2FA
//    state can NEVER be changed without a code (profile settings writes to
//    `twoFactorEnabled` are ignored for the same reason).
//  - Login: users with 2FA enabled get `{ requires2fa, challengeToken }`
//    instead of tokens; the challenge token is a single-purpose, 5-minute
//    JWT that must be exchanged together with a valid code at
//    POST /api/auth/2fa/login for the full token pair.
// ========================================================================

import { authenticator } from 'otplib';
import { sign, verify } from 'jsonwebtoken';
import prisma from '../../db';
import { config } from '../../config';
import { encrypt, decrypt } from '../../utils/encryption';
import { loggerService } from '../logger/logger.service';
import { resolvePermissionSnapshotForUser } from '../../lib/permissions';
import { authService } from './auth.service';
import type { LoginResponseType } from './auth.schema';

// SECURITY: fail-fast, no public fallback — see auth.service.ts for the
// rationale. `config.jwtSecret` (from JWT_SECRET) is guaranteed non-empty
// by config/env.ts's own startup check; two-factor.service.ts reuses it
// (rather than JWT_REFRESH_SECRET) since its challenge token is a short-lived
// credential-step artifact, not a refresh token.
const JWT_SECRET = config.jwtSecret;

const CHALLENGE_TOKEN_EXPIRY = '5m';
const CHALLENGE_PURPOSE = '2fa-challenge';
const TOTP_ISSUER = 'Veltrix';

/** Request-level error with an HTTP status (mirrors PlatformAdminError). */
export class TwoFactorError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

export interface TwoFactorSetupResponse {
  /** Base32 TOTP secret (shown once, for manual entry). */
  secret: string;
  /** otpauth:// URI for authenticator apps (rendered as copyable text). */
  otpauthUrl: string;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  message: string;
}

interface ChallengeTokenPayload {
  userId: string;
  purpose: string;
}

export const twoFactorService = {
  /**
   * Begin 2FA setup for an authenticated user: generates a fresh secret,
   * stores it ENCRYPTED as pending, and returns the otpauth URI. Pending
   * until verified — re-running setup safely overwrites the pending secret.
   */
  async setup(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user) {
      throw new TwoFactorError('User not found', 404);
    }

    if (user.settings?.twoFactorEnabled) {
      throw new TwoFactorError(
        'Two-factor authentication is already enabled — disable it first to generate a new secret',
        400
      );
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, TOTP_ISSUER, secret);

    await prisma.userSettings.upsert({
      where: { userId },
      update: { twoFactorPendingSecret: encrypt(secret) },
      create: { userId, twoFactorPendingSecret: encrypt(secret) },
    });

    loggerService.info(`2FA setup initiated for user ${userId} (pending verification)`);

    return { secret, otpauthUrl };
  },

  /**
   * Complete setup: the user proves possession of the secret by supplying a
   * valid TOTP code, at which point the pending secret becomes active.
   */
  async verifyAndEnable(userId: string, code: string): Promise<TwoFactorStatusResponse> {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });

    if (!settings?.twoFactorPendingSecret) {
      throw new TwoFactorError('No two-factor setup in progress — call setup first', 400);
    }

    const secret = decrypt(settings.twoFactorPendingSecret);
    if (!checkCode(code, secret)) {
      throw new TwoFactorError('Invalid verification code', 400);
    }

    await prisma.userSettings.update({
      where: { userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: settings.twoFactorPendingSecret,
        twoFactorPendingSecret: null,
      },
    });

    loggerService.info(`2FA enabled for user ${userId}`);
    return { enabled: true, message: 'Two-factor authentication enabled' };
  },

  /**
   * Disable 2FA. Requires a valid TOTP code against the ACTIVE secret —
   * possessing a logged-in session alone is not sufficient.
   */
  async disable(userId: string, code: string): Promise<TwoFactorStatusResponse> {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });

    if (!settings?.twoFactorEnabled || !settings.twoFactorSecret) {
      throw new TwoFactorError('Two-factor authentication is not enabled', 400);
    }

    const secret = decrypt(settings.twoFactorSecret);
    if (!checkCode(code, secret)) {
      throw new TwoFactorError('Invalid verification code', 400);
    }

    await prisma.userSettings.update({
      where: { userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
      },
    });

    loggerService.info(`2FA disabled for user ${userId}`);
    return { enabled: false, message: 'Two-factor authentication disabled' };
  },

  /**
   * Short-lived, single-purpose token proving the password step succeeded.
   * It is NOT an access token: it grants nothing except the right to attempt
   * the TOTP step at POST /api/auth/2fa/login within 5 minutes.
   */
  createChallengeToken(userId: string): string {
    return sign(
      { userId, purpose: CHALLENGE_PURPOSE } satisfies ChallengeTokenPayload,
      JWT_SECRET as any,
      { expiresIn: CHALLENGE_TOKEN_EXPIRY } as any
    );
  },

  /** Returns the userId for a valid, unexpired challenge token, else null. */
  verifyChallengeToken(token: string): string | null {
    try {
      const decoded = verify(token, JWT_SECRET as any) as ChallengeTokenPayload;
      if (decoded.purpose !== CHALLENGE_PURPOSE || !decoded.userId) {
        return null;
      }
      return decoded.userId;
    } catch {
      return null;
    }
  },

  /**
   * Exchange a challenge token + valid TOTP code for the full token pair.
   * Re-runs the same account/tenant gates as password login — account state
   * may have changed between the two steps.
   */
  async completeLogin(challengeToken: string, code: string): Promise<LoginResponseType> {
    const userId = this.verifyChallengeToken(challengeToken);
    if (!userId) {
      throw new TwoFactorError('Invalid or expired challenge token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        // Relation field name is unchanged by the Customer -> Organization
        // model rename — see the note at the top of schema.prisma.
        customer: true,
        settings: true,
      },
    });

    if (!user || !user.isActive) {
      throw new TwoFactorError('Invalid or expired challenge token', 401);
    }

    if (!user.customer.isActive) {
      throw new TwoFactorError('Invalid or expired challenge token', 401);
    }

    if (!user.settings?.twoFactorEnabled || !user.settings.twoFactorSecret) {
      // 2FA was disabled between the two steps — force a fresh login rather
      // than silently issuing tokens from a stale challenge.
      throw new TwoFactorError('Invalid or expired challenge token', 401);
    }

    const secret = decrypt(user.settings.twoFactorSecret);
    if (!checkCode(code, secret)) {
      throw new TwoFactorError('Invalid verification code', 401);
    }

    const tokens = authService.generateTokens(user.id, user.email, user.customerId, user.roleId);

    // Tokens are being issued — the 2FA login is now complete, so stamp
    // User.lastLoginAt here (the password step deliberately does not).
    await authService.recordSuccessfulLogin(user.id);

    const permissions = await resolvePermissionSnapshotForUser(user.id);

    loggerService.info(`2FA login completed for user ${user.id}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: String(user.name || ''),
        role: String(user.role?.name || 'Unknown'),
        customerId: user.customerId,
      },
      token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type,
      expires_in: tokens.expires_in,
      refresh_expires_in: tokens.refresh_expires_in,
      permissions,
    };
  },
};

/** authenticator.check throws on malformed input — treat that as "invalid". */
function checkCode(code: string, secret: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}

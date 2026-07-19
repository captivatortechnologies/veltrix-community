import { authService } from '../auth.service';
import prisma from '../../../db';
import * as bcrypt from 'bcrypt';

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    passwordResetToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'tok-1' }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userPassword: { upsert: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('new-hash') }));

jest.mock('../../logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// The email service is dynamically imported inside requestPasswordReset.
const sendPasswordResetEmail = jest.fn().mockResolvedValue({ delivered: true, provider: 'smtp' });
jest.mock('../../email/email.service', () => ({
  emailService: { sendPasswordResetEmail: (...args: unknown[]) => sendPasswordResetEmail(...args) },
}));

const activeLocalUser = {
  id: 'user-1',
  email: 'member@tenant.test',
  authProvider: 'LOCAL',
  isActive: true,
  password: { password: 'stored-hash' },
};

describe('authService.requestPasswordReset', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues a token and emails a reset link for an active LOCAL account', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(activeLocalUser);

    await authService.requestPasswordReset('member@tenant.test');

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    // Only the hash is stored — never the raw token.
    const created = (prisma.passwordResetToken.create as jest.Mock).mock.calls[0][0];
    expect(created.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.data.expiresAt).toBeInstanceOf(Date);

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [to, resetUrl] = sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe('member@tenant.test');
    expect(resetUrl).toMatch(/\/reset-password\?token=[0-9a-f]{64}$/);
  });

  it('does nothing (no token, no email) for an unknown email — no enumeration', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await authService.requestPasswordReset('nobody@tenant.test');

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('ignores SSO accounts (non-LOCAL provider)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...activeLocalUser, authProvider: 'OIDC', password: null });

    await authService.requestPasswordReset('member@tenant.test');

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('authService.resetPassword', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resets the password for a valid, unexpired, unused token', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const ok = await authService.resetPassword('a'.repeat(64), 'new-password-123');

    expect(ok).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith('new-password-123', 10);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired token without changing the password', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const ok = await authService.resetPassword('a'.repeat(64), 'new-password-123');

    expect(ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an already-used token', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const ok = await authService.resetPassword('a'.repeat(64), 'new-password-123');

    expect(ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing/unknown token', async () => {
    (prisma.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);

    const ok = await authService.resetPassword('a'.repeat(64), 'new-password-123');

    expect(ok).toBe(false);
  });
});

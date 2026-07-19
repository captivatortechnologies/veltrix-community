import { authenticator } from 'otplib';
import { verify, sign } from 'jsonwebtoken';
import { twoFactorService, TwoFactorError } from '../two-factor.service';
import prisma from '../../../db';
import { config } from '../../../config';
import { encrypt, isEncrypted, decrypt } from '../../../utils/encryption';

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    // Backs resolvePermissionSnapshotForUser (lib/permissions.ts), called at
    // the end of a successful completeLogin to attach the `permissions` block.
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const USER_ID = 'user-1';

/** A real base32 secret + a helper to produce currently-valid codes. */
const SECRET = authenticator.generateSecret();
const validCode = () => authenticator.generate(SECRET);

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'member@tenant.test',
    name: 'Tenant Member',
    customerId: 'cust-1',
    roleId: 'role-1',
    isActive: true,
    role: { id: 'role-1', name: 'Administrator' },
    // `customer` is the User model's relation field name (unchanged by the
    // Customer -> Organization model rename — see schema.prisma).
    customer: { id: 'cust-1', isActive: true },
    settings: {
      userId: USER_ID,
      twoFactorEnabled: true,
      twoFactorSecret: encrypt(SECRET),
      twoFactorPendingSecret: null,
    },
    ...overrides,
  };
}

describe('Two-Factor Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('stores an ENCRYPTED pending secret and returns the otpauth URI', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: USER_ID,
        email: 'member@tenant.test',
        settings: null,
      });
      (prisma.userSettings.upsert as jest.Mock).mockResolvedValue({});

      const result = await twoFactorService.setup(USER_ID);

      expect(result.secret).toEqual(expect.any(String));
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain('Veltrix');
      expect(result.otpauthUrl).toContain('member%40tenant.test');

      const upsertArgs = (prisma.userSettings.upsert as jest.Mock).mock.calls[0][0];
      const stored = upsertArgs.update.twoFactorPendingSecret as string;
      // Never stored in plaintext; round-trips through the encryption util.
      expect(stored).not.toBe(result.secret);
      expect(isEncrypted(stored)).toBe(true);
      expect(decrypt(stored)).toBe(result.secret);
      // Setup alone must NOT enable 2FA.
      expect(upsertArgs.update.twoFactorEnabled).toBeUndefined();
      expect(upsertArgs.create.twoFactorEnabled).toBeUndefined();
    });

    it('400s when 2FA is already enabled', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser());

      await expect(twoFactorService.setup(USER_ID)).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.userSettings.upsert).not.toHaveBeenCalled();
    });

    it('404s for an unknown user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(twoFactorService.setup(USER_ID)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('verifyAndEnable', () => {
    it('promotes the pending secret and enables 2FA on a valid code', async () => {
      const encryptedPending = encrypt(SECRET);
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: encryptedPending,
      });
      (prisma.userSettings.update as jest.Mock).mockResolvedValue({});

      const result = await twoFactorService.verifyAndEnable(USER_ID, validCode());

      expect(result.enabled).toBe(true);
      expect(prisma.userSettings.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: encryptedPending,
          twoFactorPendingSecret: null,
        },
      });
    });

    it('rejects an invalid code without enabling anything', async () => {
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorPendingSecret: encrypt(SECRET),
      });

      await expect(twoFactorService.verifyAndEnable(USER_ID, '000000')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prisma.userSettings.update).not.toHaveBeenCalled();
    });

    it('400s when no setup is in progress', async () => {
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorPendingSecret: null,
      });

      await expect(twoFactorService.verifyAndEnable(USER_ID, validCode())).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('disable', () => {
    it('disables 2FA and clears both secrets on a valid code', async () => {
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorEnabled: true,
        twoFactorSecret: encrypt(SECRET),
      });
      (prisma.userSettings.update as jest.Mock).mockResolvedValue({});

      const result = await twoFactorService.disable(USER_ID, validCode());

      expect(result.enabled).toBe(false);
      expect(prisma.userSettings.update).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
        },
      });
    });

    it('requires a valid TOTP code — a session alone cannot disable 2FA', async () => {
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorEnabled: true,
        twoFactorSecret: encrypt(SECRET),
      });

      await expect(twoFactorService.disable(USER_ID, '000000')).rejects.toBeInstanceOf(
        TwoFactorError
      );
      expect(prisma.userSettings.update).not.toHaveBeenCalled();
    });

    it('400s when 2FA is not enabled', async () => {
      (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
        userId: USER_ID,
        twoFactorEnabled: false,
        twoFactorSecret: null,
      });

      await expect(twoFactorService.disable(USER_ID, validCode())).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('challenge tokens', () => {
    it('round-trips a valid challenge token', () => {
      const token = twoFactorService.createChallengeToken(USER_ID);
      expect(twoFactorService.verifyChallengeToken(token)).toBe(USER_ID);

      // Single-purpose and short-lived (5 minutes).
      const decoded = verify(token, config.jwtSecret) as Record<string, unknown>;
      expect(decoded.purpose).toBe('2fa-challenge');
      expect((decoded.exp as number) - (decoded.iat as number)).toBe(300);
    });

    it('rejects garbage and wrong-purpose tokens', () => {
      expect(twoFactorService.verifyChallengeToken('not-a-jwt')).toBeNull();

      // A normal ACCESS token must never pass as a 2FA challenge.
      const accessLike = sign({ userId: USER_ID, customerId: 'cust-1', roleId: 'role-1' }, config.jwtSecret, {
        expiresIn: '5m',
      });
      expect(twoFactorService.verifyChallengeToken(accessLike)).toBeNull();
    });
  });

  describe('completeLogin', () => {
    it('returns the full token pair for a valid challenge + code', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser());
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      const result = await twoFactorService.completeLogin(challenge, validCode());

      expect(result.user).toMatchObject({
        id: USER_ID,
        email: 'member@tenant.test',
        customerId: 'cust-1',
      });
      expect(result.token).toEqual(expect.any(String));
      expect(result.refresh_token).toEqual(expect.any(String));

      // The issued access token is a NORMAL token for the user (no
      // impersonation claims, standard payload).
      const decoded = verify(result.token!, config.jwtSecret) as Record<string, unknown>;
      expect(decoded.userId).toBe(USER_ID);
      expect(decoded.impersonation).toBeUndefined();
    });

    it('stamps User.lastLoginAt when the 2FA login issues tokens', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser());
      (prisma.user.update as jest.Mock).mockResolvedValue({});
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await twoFactorService.completeLogin(challenge, validCode());

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('does NOT stamp lastLoginAt when the code is wrong', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser());
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await expect(twoFactorService.completeLogin(challenge, '000000')).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('401s for an invalid or expired challenge token', async () => {
      await expect(twoFactorService.completeLogin('garbage', validCode())).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('401s for a wrong code', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser());
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await expect(twoFactorService.completeLogin(challenge, '000000')).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('401s when the account was deactivated between the two steps', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildUser({ isActive: false }));
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await expect(twoFactorService.completeLogin(challenge, validCode())).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('401s when the organization was suspended between the two steps', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUser({ customer: { id: 'cust-1', isActive: false } })
      );
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await expect(twoFactorService.completeLogin(challenge, validCode())).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('401s when 2FA was disabled between the two steps (stale challenge)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        buildUser({
          settings: {
            userId: USER_ID,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorPendingSecret: null,
          },
        })
      );
      const challenge = twoFactorService.createChallengeToken(USER_ID);

      await expect(twoFactorService.completeLogin(challenge, validCode())).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});

import { authService } from '../auth.service';
import prisma from '../../../db';
import * as bcrypt from 'bcrypt';

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
    // Backs resolvePermissionSnapshotForUser (lib/permissions.ts), called at
    // the end of every successful login to attach the `permissions` block.
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('../../logger/logger.service', () => ({
  loggerService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

function buildLocalUser(
  overrides: {
    isActive?: boolean;
    organization?: Partial<{ isActive: boolean }>;
  } = {}
) {
  return {
    id: 'user-1',
    email: 'member@tenant.test',
    name: 'Tenant Member',
    customerId: 'cust-1',
    roleId: 'role-1',
    authProvider: 'LOCAL',
    isActive: overrides.isActive ?? true,
    role: { id: 'role-1', name: 'Administrator' },
    password: { password: 'stored-hash' },
    // `customer` is the User model's relation field name (unchanged by the
    // Customer -> Organization model rename — only the relation's target
    // type changed, see schema.prisma).
    customer: {
      id: 'cust-1',
      isActive: true,
      ...overrides.organization,
    },
  };
}

describe('authService.login — organization + account lifecycle enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in a user whose organization is active', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({ email: 'member@tenant.test', password: 'correct-password' });

    expect(result).not.toBeNull();
    expect(result?.user.email).toBe('member@tenant.test');
    expect(result?.user.customerId).toBe('cust-1');
    expect(result?.token).toEqual(expect.any(String));
  });

  it('rejects login when the password does not match (unrelated to lifecycle)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const result = await authService.login({ email: 'member@tenant.test', password: 'wrong-password' });

    expect(result).toBeNull();
  });

  it('rejects login when the organization has been disabled (isActive=false)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildLocalUser({ organization: { isActive: false } })
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({ email: 'member@tenant.test', password: 'correct-password' });

    expect(result).toBeNull();
  });

  it('rejects login when the USER account itself has been deactivated (isActive=false), even though the organization is active', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser({ isActive: false }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({ email: 'member@tenant.test', password: 'correct-password' });

    expect(result).toBeNull();
  });

  it('logs in a user with an active account (isActive=true) and an active organization, unaffected by the new check', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser({ isActive: true }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({ email: 'member@tenant.test', password: 'correct-password' });

    expect(result).not.toBeNull();
    expect(result?.user.email).toBe('member@tenant.test');
  });
});

describe('authService.login — TOTP 2FA gate (P6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const withSettings = (settings: Record<string, unknown> | null) => ({
    ...buildLocalUser(),
    settings,
  });

  it('returns a 2FA challenge (and NO tokens) when 2FA is enabled with a verified secret', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      withSettings({ twoFactorEnabled: true, twoFactorSecret: 'aa11:bb22' })
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ requires2fa: true, challengeToken: expect.any(String) });
    // Absolutely no credentials leak through the challenge response.
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('refresh_token');
    expect(result).not.toHaveProperty('user');
  });

  it('still rejects a wrong password before ever reaching the 2FA branch', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      withSettings({ twoFactorEnabled: true, twoFactorSecret: 'aa11:bb22' })
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'wrong-password',
    });

    expect(result).toBeNull();
  });

  it('REGRESSION: a user with no settings row logs in with tokens exactly as before', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(withSettings(null));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({
      token: expect.any(String),
      refresh_token: expect.any(String),
      user: expect.objectContaining({ email: 'member@tenant.test' }),
    });
    expect(result).not.toHaveProperty('requires2fa');
  });

  it('REGRESSION: a user with 2FA explicitly disabled logs in with tokens', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      withSettings({ twoFactorEnabled: false, twoFactorSecret: null })
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ token: expect.any(String) });
    expect(result).not.toHaveProperty('requires2fa');
  });

  it('REGRESSION: a legacy enabled-flag WITHOUT a verified secret does not lock the user out', async () => {
    // Before P6 the profile page could set twoFactorEnabled=true with no
    // secret on record. Such users must keep logging in normally.
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      withSettings({ twoFactorEnabled: true, twoFactorSecret: null })
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ token: expect.any(String) });
    expect(result).not.toHaveProperty('requires2fa');
  });
});

describe('authService.login — lastLoginAt stamping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stamps User.lastLoginAt when a direct (non-2FA) login issues tokens', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ token: expect.any(String) });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('does NOT stamp lastLoginAt when only a 2FA challenge is returned (no tokens yet)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...buildLocalUser(),
      settings: {
        userId: 'user-1',
        twoFactorEnabled: true,
        twoFactorSecret: 'encrypted-secret',
        twoFactorPendingSecret: null,
      },
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ requires2fa: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does NOT stamp lastLoginAt on a failed login', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'wrong-password',
    });

    expect(result).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('still logs the user in when the lastLoginAt stamp fails (non-fatal)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(buildLocalUser());
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error('db down'));

    const result = await authService.login({
      email: 'member@tenant.test',
      password: 'correct-password',
    });

    expect(result).toMatchObject({ token: expect.any(String) });
  });
});

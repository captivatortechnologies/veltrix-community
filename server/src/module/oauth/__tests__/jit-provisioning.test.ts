// I2: JIT (just-in-time) provisioning redesign, shared by Google, Microsoft,
// and Cognito via findOrProvisionSsoUser. Covers all three jitModes
// ('disabled' | 'domain-match' | 'legacy-first-customer'), the
// unknown-domain rejection, and the returning-user lookup fix (the old code
// stored `email: providerId`, making returning users unfindable by email).

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    organization: { findFirst: jest.fn() },
    role: { findFirst: jest.fn() },
    userProfile: { update: jest.fn() },
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

jest.mock('../oauth-state.store', () => ({
  consumeOAuthNonce: jest.fn(),
}));

import prisma from '../../../db';
import { findOrProvisionSsoUser } from '../oauth.utils';

describe('findOrProvisionSsoUser — returning-user lookup (I2)', () => {
  beforeEach(() => jest.clearAllMocks());

  const foundUser = {
    id: 'user-1',
    email: 'alice@acme.com',
    providerAccountId: 'sub-abc',
    isActive: true,
    customerId: 'cust-1',
    roleId: 'role-1',
    role: { id: 'role-1', name: 'User' },
    // `customer` is the User model's relation field name (unchanged by the
    // Customer -> Organization model rename — see schema.prisma).
    customer: { id: 'cust-1', isActive: true },
    profile: null,
  };

  it('finds a returning user by providerAccountId (the canonical post-fix path)', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(foundUser);

    const result = await findOrProvisionSsoUser({
      authProvider: 'GOOGLE',
      providerId: 'sub-abc',
      email: 'alice@acme.com',
      jitMode: 'domain-match',
    });

    expect(result.id).toBe('user-1');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ providerAccountId: 'sub-abc' }, { email: 'alice@acme.com' }, { email: 'sub-abc' }] },
      })
    );
    // No creation attempted for a returning user.
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('finds a returning user by real email (e.g. an existing LOCAL/other-SSO account)', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({ ...foundUser, providerAccountId: null });
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ ...foundUser, providerAccountId: 'sub-abc' });

    const result = await findOrProvisionSsoUser({
      authProvider: 'GOOGLE',
      providerId: 'sub-abc',
      email: 'alice@acme.com',
      jitMode: 'domain-match',
    });

    expect(result.providerAccountId).toBe('sub-abc');
    // Heals the row so future lookups hit providerAccountId directly.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { providerAccountId: 'sub-abc' } })
    );
  });

  it('finds a pre-fix legacy user via email===providerId and backfills providerAccountId without touching email', async () => {
    const legacyUser = { ...foundUser, email: 'sub-abc', providerAccountId: null };
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(legacyUser);
    (prisma.user.update as jest.Mock).mockResolvedValueOnce({ ...legacyUser, providerAccountId: 'sub-abc' });

    const result = await findOrProvisionSsoUser({
      authProvider: 'GOOGLE',
      providerId: 'sub-abc',
      email: 'alice@acme.com',
      jitMode: 'domain-match',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { providerAccountId: 'sub-abc' } })
    );
    // Email is never rewritten by this path (avoids unique-constraint risk).
    const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('email');
    expect(result.providerAccountId).toBe('sub-abc');
  });

  it('does not re-heal a user that already has providerAccountId set', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(foundUser);

    await findOrProvisionSsoUser({
      authProvider: 'GOOGLE',
      providerId: 'sub-abc',
      email: 'alice@acme.com',
      jitMode: 'domain-match',
    });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('findOrProvisionSsoUser — jitMode branches (I2)', () => {
  beforeEach(() => jest.clearAllMocks());

  const newUserParams = {
    authProvider: 'GOOGLE',
    providerId: 'new-sub-1',
    email: 'newperson@acme.com',
    displayName: 'New Person',
  };

  describe('disabled', () => {
    it('rejects provisioning a genuinely new identity with a clear, specific error', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        findOrProvisionSsoUser({ ...newUserParams, jitMode: 'disabled' })
      ).rejects.toMatchObject({ code: 'jit_disabled', statusCode: 403 });

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('domain-match', () => {
    it('provisions the user under the organization whose domain matches the email domain', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'acme-customer-id' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'role-user' });
      (prisma.user.create as jest.Mock).mockResolvedValueOnce({
        id: 'new-user-1',
        email: newUserParams.email,
        providerAccountId: newUserParams.providerId,
        isActive: true,
        customerId: 'acme-customer-id',
        roleId: 'role-user',
        role: { id: 'role-user', name: 'User' },
        customer: { id: 'acme-customer-id', isActive: true },
        profile: null,
      });

      const result = await findOrProvisionSsoUser({ ...newUserParams, jitMode: 'domain-match' });

      expect(prisma.organization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { domain: { equals: 'acme.com', mode: 'insensitive' } } })
      );
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newperson@acme.com',
            providerAccountId: 'new-sub-1',
            customerId: 'acme-customer-id',
          }),
        })
      );
      expect(result.customerId).toBe('acme-customer-id');
    });

    it('rejects an unknown domain with a clear, specific error (does not fall back to any other tenant)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        findOrProvisionSsoUser({ ...newUserParams, email: 'person@unknown-domain.test', jitMode: 'domain-match' })
      ).rejects.toMatchObject({ code: 'jit_domain_not_allowed', statusCode: 403 });

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects with a clear error when the matched organization has no default "User" role', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'acme-customer-id' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        findOrProvisionSsoUser({ ...newUserParams, jitMode: 'domain-match' })
      ).rejects.toMatchObject({ code: 'jit_no_default_role' });
    });
  });

  describe('legacy-first-customer', () => {
    it('provisions the user under the first active organization (opt-in legacy behavior, unchanged from before this fix)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'first-active-customer' });
      (prisma.role.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'role-user' });
      (prisma.user.create as jest.Mock).mockResolvedValueOnce({
        id: 'new-user-2',
        email: newUserParams.email,
        providerAccountId: newUserParams.providerId,
        isActive: true,
        customerId: 'first-active-customer',
        roleId: 'role-user',
        role: { id: 'role-user', name: 'User' },
        customer: { id: 'first-active-customer', isActive: true },
        profile: null,
      });

      const result = await findOrProvisionSsoUser({ ...newUserParams, jitMode: 'legacy-first-customer' });

      expect(prisma.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
      expect(result.customerId).toBe('first-active-customer');
    });

    it('rejects with a clear error when there is no active organization at all', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        findOrProvisionSsoUser({ ...newUserParams, jitMode: 'legacy-first-customer' })
      ).rejects.toMatchObject({ code: 'jit_no_tenant' });
    });
  });
});

// I1: encryption-at-rest for IdP client secrets (idempotent, legacy-plaintext
// safe), SSO gate parity (deactivated user / suspended tenant rejected, same
// as LOCAL login), and nonce consumption wired into the shared SSO
// provisioning path used by Google + Microsoft.

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    identityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    customerIdentityProvider: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
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
import { isEncrypted, decrypt } from '../../../utils/encryption';
import {
  getOAuthConfig,
  saveOAuthConfig,
  exchangeTokensForJWT,
  resolveCustomerIdFromHint,
  OAuthFlowError,
} from '../oauth.utils';
import { consumeOAuthNonce } from '../oauth-state.store';

describe('oauth.utils — config secret encryption (I1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveOAuthConfig', () => {
    it('encrypts clientSecret before persisting a new global config', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(null);

      await saveOAuthConfig('GOOGLE', 'Google', {
        enabled: true,
        clientId: 'client-id',
        clientSecret: 'super-secret-value',
        redirectUri: 'https://app.example.com/oauth/callback',
        scope: 'openid email profile',
      });

      expect(prisma.identityProvider.create).toHaveBeenCalledTimes(1);
      const created = (prisma.identityProvider.create as jest.Mock).mock.calls[0][0];
      const persistedConfig = JSON.parse(created.data.config);

      expect(persistedConfig.clientSecret).not.toBe('super-secret-value');
      expect(isEncrypted(persistedConfig.clientSecret)).toBe(true);
      expect(decrypt(persistedConfig.clientSecret)).toBe('super-secret-value');
    });

    it('defaults jitMode to domain-match for a brand-new config', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValue(null);

      await saveOAuthConfig(
        'AZURE',
        'Microsoft',
        { enabled: true, clientId: 'c', clientSecret: 's', redirectUri: 'r', scope: 'openid' },
        'cust-1'
      );

      const created = (prisma.customerIdentityProvider.create as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(created.data.config).jitMode).toBe('domain-match');
    });

    it('preserves the existing jitMode on update when the caller does not specify one', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-1',
        config: JSON.stringify({ clientId: 'old', clientSecret: 'old-secret', jitMode: 'disabled' }),
      });

      await saveOAuthConfig('GOOGLE', 'Google', {
        enabled: true,
        clientId: 'new-client-id',
        clientSecret: 'new-secret',
        redirectUri: 'https://app.example.com/oauth/callback',
        scope: 'openid email profile',
      });

      const updated = (prisma.identityProvider.update as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(updated.data.config).jitMode).toBe('disabled');
    });
  });

  describe('getOAuthConfig', () => {
    it('decrypts a previously-encrypted clientSecret on read', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-1',
        enabled: true,
        config: JSON.stringify(
          (() => {
            // Round-trip through the real save path to get a realistic ciphertext.
            const { encrypt } = require('../../../utils/encryption');
            return { clientId: 'abc', clientSecret: encrypt('the-real-secret'), redirectUri: 'r', scope: 's' };
          })()
        ),
      });

      const result = await getOAuthConfig('GOOGLE');
      expect(result?.clientSecret).toBe('the-real-secret');
    });

    it('reads a legacy plaintext clientSecret unchanged (backward compatible)', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-1',
        enabled: true,
        config: JSON.stringify({ clientId: 'abc', clientSecret: 'legacy-plaintext-secret', redirectUri: 'r', scope: 's' }),
      });

      const result = await getOAuthConfig('GOOGLE');
      expect(result?.clientSecret).toBe('legacy-plaintext-secret');
    });

    it('defaults jitMode to legacy-first-customer for a config saved before jitMode existed', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-1',
        enabled: true,
        config: JSON.stringify({ clientId: 'abc', clientSecret: 'x', redirectUri: 'r', scope: 's' }),
      });

      const result = await getOAuthConfig('GOOGLE');
      expect(result?.jitMode).toBe('legacy-first-customer');
    });
  });
});

describe('exchangeTokensForJWT — SSO gate parity + nonce (I1)', () => {
  const baseUserInfo = {
    email: 'sso.user@tenant.test',
    name: 'SSO User',
    providerId: 'provider-sub-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockExistingUser(overrides: { isActive?: boolean; organization?: Partial<{ isActive: boolean }> } = {}) {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'provider-sub-123',
      providerAccountId: 'provider-sub-123',
      name: 'SSO User',
      firstName: null,
      lastName: null,
      phoneNumber: null,
      customerId: 'cust-1',
      roleId: 'role-1',
      isActive: overrides.isActive ?? true,
      role: { id: 'role-1', name: 'User' },
      // `customer` is the User model's relation field name (unchanged by the
      // Customer -> Organization model rename — see schema.prisma).
      customer: { id: 'cust-1', isActive: true, ...overrides.organization },
      profile: null,
    });
  }

  it('mints tokens for an active user in an active organization', async () => {
    mockExistingUser();
    const result = await exchangeTokensForJWT(baseUserInfo, 'GOOGLE');
    expect(result.user.email).toBe('provider-sub-123');
    expect(result.token).toEqual(expect.any(String));
  });

  it('rejects a deactivated user account even though the organization is active (I1 gate parity)', async () => {
    mockExistingUser({ isActive: false });
    await expect(exchangeTokensForJWT(baseUserInfo, 'GOOGLE')).rejects.toThrow(/deactivated/i);
  });

  it('rejects a suspended organization (isActive=false) even though the user is active', async () => {
    mockExistingUser({ organization: { isActive: false } });
    await expect(exchangeTokensForJWT(baseUserInfo, 'GOOGLE')).rejects.toThrow(/not active/i);
  });

  it('surfaces gate failures as OAuthFlowError with a machine-readable code', async () => {
    mockExistingUser({ isActive: false });
    await expect(exchangeTokensForJWT(baseUserInfo, 'GOOGLE')).rejects.toMatchObject({
      code: 'user_inactive',
      statusCode: 403,
    } as Partial<OAuthFlowError>);
  });

  it('rejects when a supplied nonce is invalid/expired/replayed, before any user lookup', async () => {
    (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce(null);

    await expect(exchangeTokensForJWT(baseUserInfo, 'GOOGLE', 'bad-nonce')).rejects.toMatchObject({
      code: 'invalid_nonce',
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('proceeds when a supplied nonce is valid', async () => {
    (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce({ customerId: 'cust-1' });
    mockExistingUser();

    const result = await exchangeTokensForJWT(baseUserInfo, 'GOOGLE', 'good-nonce');
    expect(consumeOAuthNonce).toHaveBeenCalledWith('good-nonce', 'GOOGLE');
    expect(result.user.email).toBe('provider-sub-123');
  });
});

describe('resolveCustomerIdFromHint — per-tenant config resolution at login (I3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves an email hint to the organization whose domain matches', async () => {
    (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'acme-customer-id' });

    const result = await resolveCustomerIdFromHint('alice@Acme.com');

    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { domain: { equals: 'acme.com', mode: 'insensitive' }, isActive: true } })
    );
    expect(result).toBe('acme-customer-id');
  });

  it('resolves a raw domain hint (no @) the same way', async () => {
    (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'acme-customer-id' });

    const result = await resolveCustomerIdFromHint('acme.com');

    expect(result).toBe('acme-customer-id');
  });

  it('falls back to undefined (never throws) for an unrecognized domain — login still falls back to global config', async () => {
    (prisma.organization.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await resolveCustomerIdFromHint('someone@unknown-domain.test');

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty/missing hint without querying the database', async () => {
    expect(await resolveCustomerIdFromHint(undefined)).toBeUndefined();
    expect(await resolveCustomerIdFromHint('')).toBeUndefined();
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('returns undefined for a malformed email with no domain part', async () => {
    const result = await resolveCustomerIdFromHint('not-an-email@');
    expect(result).toBeUndefined();
  });
});

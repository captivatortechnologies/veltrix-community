// Config CRUD (encryption/redaction-adjacent behavior — redaction itself is
// a controller concern, tested in oidc.controller.test.ts) and the
// exchangeOidcTokens integration: proves it wires verifyIdToken's result and
// the config's jitMode into the SHARED, already-exhaustively-tested
// `exchangeTokensForJWT` (gate parity: user.isActive/customer.status — see
// oauth.utils.test.ts) and `findOrProvisionSsoUser` (all 3 jitModes — see
// jit-provisioning.test.ts) rather than re-deriving that logic per provider.

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    identityProvider: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerIdentityProvider: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('../../logger/logger.service', () => ({
  loggerService: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/cache.service', () => ({
  cacheService: { isReady: jest.fn(() => false), get: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../oauth/oauth-state.store', () => ({
  createOAuthFlowState: jest.fn(),
  consumeOAuthState: jest.fn(),
  consumeOAuthNonce: jest.fn(),
}));

// Partial mock: keep the real OAuthFlowError class (instanceof checks
// throughout this file and the production code depend on it) but replace
// `exchangeTokensForJWT` with a spy so this file can assert exactly what
// oidcService.exchangeOidcTokens passes to it, without re-deriving gate
// parity / nonce-consumption behavior that's already covered generically.
jest.mock('../../oauth/oauth.utils', () => {
  const actual = jest.requireActual('../../oauth/oauth.utils');
  return { ...actual, exchangeTokensForJWT: jest.fn() };
});

import prisma from '../../../db';
import { exchangeTokensForJWT, OAuthFlowError } from '../../oauth/oauth.utils';
import { consumeOAuthNonce } from '../../oauth/oauth-state.store';
import { oidcService } from '../oidc.service';

const mockExchangeTokensForJWT = exchangeTokensForJWT as jest.Mock;
const mockConsumeOAuthNonce = consumeOAuthNonce as jest.Mock;

describe('oidcService — config CRUD', () => {
  // resetAllMocks (not clearAllMocks): several tests below queue a
  // `mockResolvedValueOnce` on a mock the code path under test doesn't end
  // up calling (e.g. a customer-scoped lookup when the call under test is
  // global-scoped) — clearAllMocks only clears call history, leaving that
  // unconsumed queued value to leak into (and corrupt) the next test's
  // first call to the same mock. resetAllMocks discards it.
  beforeEach(() => jest.resetAllMocks());

  describe('saveOidcConfig', () => {
    it('encrypts clientSecret before persisting a new global config', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await oidcService.saveOidcConfig({
        enabled: true,
        issuer: 'https://issuer.example.com',
        clientId: 'client-1',
        clientSecret: 'super-secret',
        redirectUri: 'https://app.example.com/oauth/callback',
        scope: 'openid email profile',
      });

      expect(prisma.identityProvider.create).toHaveBeenCalledTimes(1);
      const created = (prisma.identityProvider.create as jest.Mock).mock.calls[0][0];
      const savedConfig = JSON.parse(created.data.config);
      expect(savedConfig.clientSecret).not.toBe('super-secret');
      // AES-256-GCM (authenticated) format: v2:<salt>:<iv>:<tag>:<cipher>
      expect(savedConfig.clientSecret).toMatch(/^v2:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(savedConfig.issuer).toBe('https://issuer.example.com');
    });

    it('defaults jitMode to domain-match for a brand-new config', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await oidcService.saveOidcConfig(
        {
          enabled: true,
          issuer: 'https://issuer.example.com',
          clientId: 'client-1',
          clientSecret: 'secret',
          redirectUri: 'https://app.example.com/oauth/callback',
          scope: 'openid',
        },
        'cust-1'
      );

      const created = (prisma.customerIdentityProvider.create as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(created.data.config).jitMode).toBe('domain-match');
    });

    it('preserves the existing jitMode on update when the caller does not specify one', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({
        id: 'idp-1',
        config: JSON.stringify({ issuer: 'https://issuer.example.com', clientId: 'client-1', jitMode: 'disabled' }),
      });

      await oidcService.saveOidcConfig({
        enabled: true,
        issuer: 'https://issuer.example.com',
        clientId: 'client-1',
        clientSecret: 'secret',
        redirectUri: 'https://app.example.com/oauth/callback',
        scope: 'openid',
      });

      const updated = (prisma.identityProvider.update as jest.Mock).mock.calls[0][0];
      expect(JSON.parse(updated.data.config).jitMode).toBe('disabled');
    });
  });

  describe('getOidcConfig', () => {
    it('decrypts a previously-encrypted clientSecret on read', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await oidcService.saveOidcConfig({
        enabled: true,
        issuer: 'https://issuer.example.com',
        clientId: 'client-1',
        clientSecret: 'round-trip-secret',
        redirectUri: 'https://app.example.com/oauth/callback',
        scope: 'openid',
      });
      const created = (prisma.identityProvider.create as jest.Mock).mock.calls[0][0];

      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'idp-1', enabled: true, config: created.data.config });

      const config = await oidcService.getOidcConfig();
      expect(config?.clientSecret).toBe('round-trip-secret');
    });

    it('prefers an enabled customer-specific config over the global one', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce({
        enabled: true,
        config: JSON.stringify({ issuer: 'https://tenant-issuer.example.com', clientId: 'tenant-client' }),
      });

      const config = await oidcService.getOidcConfig('cust-1');
      expect(config?.issuer).toBe('https://tenant-issuer.example.com');
      expect(config?.isCustomerSpecific).toBe(true);
    });

    it('falls back to the global config when no enabled customer-specific config exists', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({
        enabled: true,
        config: JSON.stringify({ issuer: 'https://global-issuer.example.com', clientId: 'global-client' }),
      });

      const config = await oidcService.getOidcConfig('cust-1');
      expect(config?.issuer).toBe('https://global-issuer.example.com');
      expect(config?.isCustomerSpecific).toBe(false);
    });

    it('returns null when no config exists at all', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);

      expect(await oidcService.getOidcConfig()).toBeNull();
    });
  });

  describe('getStoredOidcClientSecret', () => {
    it('reads the secret for the exact scope requested (not the login fallback chain)', async () => {
      (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValueOnce({
        config: JSON.stringify({ clientSecret: 'tenant-secret' }),
      });

      expect(await oidcService.getStoredOidcClientSecret('cust-1')).toBe('tenant-secret');
      expect(prisma.customerIdentityProvider.findFirst).toHaveBeenCalledWith({ where: { customerId: 'cust-1', type: 'OIDC' } });
    });

    it('returns undefined when no row exists for that scope', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce(null);
      expect(await oidcService.getStoredOidcClientSecret()).toBeUndefined();
    });
  });

  describe('resetOidcConfig', () => {
    it('deletes only the customer-specific row for this tenant', async () => {
      (prisma.customerIdentityProvider.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

      const result = await oidcService.resetOidcConfig('cust-1');

      expect(result).toBe(true);
      expect(prisma.customerIdentityProvider.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'cust-1', type: 'OIDC' } });
    });
  });
});

describe('oidcService.exchangeOidcTokens — wiring to the shared gate-parity/JIT pipeline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
      enabled: true,
      config: JSON.stringify({
        issuer: 'https://issuer.example.com',
        clientId: 'client-1',
        jitMode: 'domain-match',
      }),
    });
  });

  it('resolves the tenant from the nonce BEFORE verification (so a customer-specific config is honored), and passes the verified user info/provider/jitMode through to exchangeTokensForJWT with the nonce omitted (already consumed)', async () => {
    mockConsumeOAuthNonce.mockResolvedValueOnce({ customerId: 'cust-tenant-1' });
    jest.spyOn(oidcService, 'verifyIdToken').mockResolvedValueOnce({
      email: 'alice@acme.com',
      providerId: 'sub-1',
      name: 'Alice',
      emailVerified: true,
    });
    mockExchangeTokensForJWT.mockResolvedValueOnce({
      token: 'jwt',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_in: 604800,
      user: { id: 'u1', email: 'alice@acme.com', authProvider: 'OIDC' },
    });

    const result = await oidcService.exchangeOidcTokens({ idToken: 'a-valid-token', accessToken: 'access', nonce: 'n-1' });

    expect(mockConsumeOAuthNonce).toHaveBeenCalledWith('n-1', 'OIDC');
    // verifyIdToken is called with the CUSTOMER-SPECIFIC id the nonce resolved to, not undefined.
    expect(oidcService.verifyIdToken).toHaveBeenCalledWith('a-valid-token', 'cust-tenant-1', 'n-1');
    // exchangeTokensForJWT's own nonce arg is omitted — consuming the same nonce twice would always fail.
    expect(mockExchangeTokensForJWT).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@acme.com', providerId: 'sub-1' }),
      'OIDC',
      undefined,
      'domain-match'
    );
    expect(result.token).toBe('jwt');
    expect(result.user.authProvider).toBe('OIDC');
  });

  it('rejects with invalid_nonce (before any verification) when the supplied nonce is unknown/expired/replayed', async () => {
    mockConsumeOAuthNonce.mockResolvedValueOnce(null);
    const verifySpy = jest.spyOn(oidcService, 'verifyIdToken');

    await expect(
      oidcService.exchangeOidcTokens({ idToken: 'a-token', accessToken: 'access', nonce: 'replayed-nonce' })
    ).rejects.toMatchObject({ code: 'invalid_nonce' });

    expect(verifySpy).not.toHaveBeenCalled();
    expect(mockExchangeTokensForJWT).not.toHaveBeenCalled();
  });

  it('propagates a gate-parity rejection (e.g. deactivated user) from exchangeTokensForJWT without swallowing it', async () => {
    jest.spyOn(oidcService, 'verifyIdToken').mockResolvedValueOnce({ email: 'alice@acme.com', providerId: 'sub-1' });
    mockExchangeTokensForJWT.mockRejectedValueOnce(
      new OAuthFlowError('user_inactive', 'Your account has been deactivated. Contact your administrator.', 403)
    );

    await expect(oidcService.exchangeOidcTokens({ idToken: 't', accessToken: 'a' })).rejects.toMatchObject({
      code: 'user_inactive',
      statusCode: 403,
    });
  });

  it('propagates a suspended-tenant rejection from exchangeTokensForJWT', async () => {
    jest.spyOn(oidcService, 'verifyIdToken').mockResolvedValueOnce({ email: 'alice@acme.com', providerId: 'sub-1' });
    mockExchangeTokensForJWT.mockRejectedValueOnce(
      new OAuthFlowError('tenant_suspended', "Your organization's account is not active. Contact your administrator.", 403)
    );

    await expect(oidcService.exchangeOidcTokens({ idToken: 't', accessToken: 'a' })).rejects.toMatchObject({
      code: 'tenant_suspended',
      statusCode: 403,
    });
  });

  it('propagates a JIT domain-not-allowed rejection from exchangeTokensForJWT (unknown email domain)', async () => {
    jest.spyOn(oidcService, 'verifyIdToken').mockResolvedValueOnce({ email: 'bob@unknown-domain.test', providerId: 'sub-2' });
    mockExchangeTokensForJWT.mockRejectedValueOnce(
      new OAuthFlowError('jit_domain_not_allowed', 'No organization is configured for the domain "unknown-domain.test".', 403)
    );

    await expect(oidcService.exchangeOidcTokens({ idToken: 't', accessToken: 'a' })).rejects.toMatchObject({
      code: 'jit_domain_not_allowed',
      statusCode: 403,
    });
  });

  it('rejects before calling exchangeTokensForJWT when verifyIdToken itself fails (invalid token)', async () => {
    jest.spyOn(oidcService, 'verifyIdToken').mockRejectedValueOnce(
      new OAuthFlowError('invalid_token', 'Invalid OIDC ID token: signature verification failed', 401)
    );

    await expect(oidcService.exchangeOidcTokens({ idToken: 'forged', accessToken: 'a' })).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect(mockExchangeTokensForJWT).not.toHaveBeenCalled();
  });
});

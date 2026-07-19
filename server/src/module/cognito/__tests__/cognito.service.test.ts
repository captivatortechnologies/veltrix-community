// I0 (CRITICAL): the Cognito token-exchange path used to call jsonwebtoken's
// `decode()` — which parses a JWT's payload WITHOUT checking its signature.
// Anyone could hand-craft an unsigned (or garbage-signed) JWT with an
// arbitrary `email`/`sub` claim and mint a real Veltrix session for any
// user/customer — a full authentication bypass. This suite proves the fix:
// `exchangeCognitoTokens` now runs every ID token through `aws-jwt-verify`'s
// `CognitoJwtVerifier`, which checks the signature against the pool's JWKS,
// the audience (clientId), the `token_use` claim, and expiry — and that a
// token failing verification is rejected before any user is looked up or
// created (no session is minted).

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    identityProvider: { findFirst: jest.fn() },
    customerIdentityProvider: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    organization: { findFirst: jest.fn() },
    role: { findFirst: jest.fn() },
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

jest.mock('../../auth/auth.service', () => ({
  authService: {
    generateTokens: jest.fn(),
  },
}));

const mockVerify = jest.fn();
const mockCreate = jest.fn(() => ({ verify: mockVerify }));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

// I1: cognito.service.ts now depends on the server-side state/nonce store —
// mock it out (real oauth.utils.ts is left un-mocked so OAuthFlowError stays
// a real class instances can be checked against with instanceof/toMatchObject).
jest.mock('../../oauth/oauth-state.store', () => ({
  createOAuthFlowState: jest.fn(),
  consumeOAuthState: jest.fn(),
  consumeOAuthNonce: jest.fn(),
}));

import prisma from '../../../db';
import { authService } from '../../auth/auth.service';
import { cognitoService, __resetCognitoIdTokenVerifierCacheForTests } from '../cognito.service';
import { consumeOAuthNonce } from '../../oauth/oauth-state.store';

const ENABLED_POOL_CONFIG = {
  id: 'idp-cognito-1',
  name: 'AWS Cognito',
  type: 'COGNITO',
  enabled: true,
  config: JSON.stringify({
    userPoolId: 'us-east-1_TESTPOOL',
    userPoolRegion: 'us-east-1',
    clientId: 'test-client-id',
    clientSecret: 'shh-its-a-secret',
    redirectUri: 'https://app.example.com/auth/cognito/callback',
    logoutUri: 'https://app.example.com',
    scope: 'phone openid email',
  }),
};

describe('cognitoService.exchangeCognitoTokens — signature verification (I0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCognitoIdTokenVerifierCacheForTests();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_POOL_CONFIG);
  });

  it('rejects a forged/unsigned ID token instead of trusting its claims', async () => {
    // Simulates exactly the exploit: an attacker crafts a JWT with
    // `{ email: 'victim@tenant.test', sub: 'attacker-controlled-sub' }` and no
    // valid signature. aws-jwt-verify's verify() throws for such a token.
    mockVerify.mockRejectedValueOnce(new Error('JwtInvalidSignatureError: Invalid signature'));

    const forgedIdToken = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          email: 'victim@tenant.test',
          sub: 'attacker-controlled-sub',
          token_use: 'id',
          aud: 'test-client-id',
        })
      ).toString('base64url'),
      '',
    ].join('.');

    await expect(
      cognitoService.exchangeCognitoTokens({ idToken: forgedIdToken, accessToken: 'irrelevant-access-token' })
    ).rejects.toThrow(/signature verification failed/i);

    // No session was minted, and no user lookup/creation was even attempted —
    // the forged token is rejected before it ever reaches the database.
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(authService.generateTokens).not.toHaveBeenCalled();
  });

  it('only mints a session once the ID token passes signature verification', async () => {
    mockVerify.mockResolvedValueOnce({
      email: 'real.user@tenant.test',
      sub: 'legit-cognito-sub',
      name: 'Real User',
      token_use: 'id',
      aud: 'test-client-id',
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'legit-cognito-sub',
      providerAccountId: 'legit-cognito-sub',
      name: 'Real User',
      firstName: null,
      lastName: null,
      phoneNumber: null,
      customerId: 'cust-1',
      roleId: 'role-1',
      isActive: true,
      role: { id: 'role-1', name: 'User' },
      customer: { id: 'cust-1', isActive: true },
      profile: null,
    });

    (authService.generateTokens as jest.Mock).mockReturnValue({
      access_token: 'access.jwt',
      refresh_token: 'refresh.jwt',
      token_type: 'Bearer',
      expires_in: 900,
      refresh_expires_in: 604800,
    });

    const result = await cognitoService.exchangeCognitoTokens({
      idToken: 'a-genuinely-signed-token',
      accessToken: 'valid-access-token',
    });

    expect(mockVerify).toHaveBeenCalledWith('a-genuinely-signed-token');
    expect(result.token).toBe('access.jwt');
    expect(result.user.email).toBe('legit-cognito-sub');
  });

  it('creates the ID token verifier scoped to the pool userPoolId, clientId, and token_use=id', async () => {
    mockVerify.mockResolvedValueOnce({
      email: 'someone@tenant.test',
      sub: 'sub-123',
      token_use: 'id',
    });
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'user-2',
      email: 'sub-123',
      providerAccountId: 'sub-123',
      name: null,
      firstName: null,
      lastName: null,
      phoneNumber: null,
      customerId: 'cust-1',
      roleId: 'role-1',
      isActive: true,
      role: { id: 'role-1', name: 'User' },
      customer: { id: 'cust-1', isActive: true },
      profile: null,
    });
    (authService.generateTokens as jest.Mock).mockReturnValue({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 1,
      refresh_expires_in: 1,
    });

    await cognitoService.exchangeCognitoTokens({ idToken: 'token', accessToken: 'access' });

    expect(mockCreate).toHaveBeenCalledWith({
      userPoolId: 'us-east-1_TESTPOOL',
      clientId: 'test-client-id',
      tokenUse: 'id',
    });
  });
});

describe('cognitoService.exchangeCognitoTokens — SSO gate parity + nonce (I1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCognitoIdTokenVerifierCacheForTests();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_POOL_CONFIG);
    (authService.generateTokens as jest.Mock).mockReturnValue({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'Bearer',
      expires_in: 1,
      refresh_expires_in: 1,
    });
  });

  function mockVerifiedToken(nonce?: string) {
    mockVerify.mockResolvedValueOnce({
      email: 'user@tenant.test',
      sub: 'sub-1',
      token_use: 'id',
      ...(nonce ? { nonce } : {}),
    });
  }

  function mockUser(overrides: { isActive?: boolean; organization?: Partial<{ isActive: boolean }> } = {}) {
    (prisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
      id: 'user-1',
      email: 'sub-1',
      providerAccountId: 'sub-1',
      name: null,
      firstName: null,
      lastName: null,
      phoneNumber: null,
      customerId: 'cust-1',
      roleId: 'role-1',
      isActive: overrides.isActive ?? true,
      role: { id: 'role-1', name: 'User' },
      // `customer` is the User model's relation field name (unchanged by
      // the Customer -> Organization model rename — see schema.prisma).
      customer: { id: 'cust-1', isActive: true, ...overrides.organization },
      profile: null,
    });
  }

  it('rejects a deactivated user account even though the organization is active', async () => {
    mockVerifiedToken();
    mockUser({ isActive: false });

    await expect(
      cognitoService.exchangeCognitoTokens({ idToken: 'token', accessToken: 'access' })
    ).rejects.toMatchObject({ code: 'user_inactive', statusCode: 403 });
    expect(authService.generateTokens).not.toHaveBeenCalled();
  });

  it('rejects a suspended organization even though the user account is active', async () => {
    mockVerifiedToken();
    mockUser({ organization: { isActive: false } });

    await expect(
      cognitoService.exchangeCognitoTokens({ idToken: 'token', accessToken: 'access' })
    ).rejects.toMatchObject({ code: 'tenant_suspended', statusCode: 403 });
    expect(authService.generateTokens).not.toHaveBeenCalled();
  });

  it('rejects when the supplied nonce fails server-side consumption (invalid/expired/replayed)', async () => {
    (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      cognitoService.exchangeCognitoTokens({ idToken: 'token', accessToken: 'access', nonce: 'bad-nonce' })
    ).rejects.toMatchObject({ code: 'invalid_nonce' });

    // Rejected before the ID token is even verified.
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rejects when the ID token nonce claim does not match the consumed nonce', async () => {
    (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce({ customerId: undefined });
    mockVerifiedToken('a-different-nonce-than-was-issued');

    await expect(
      cognitoService.exchangeCognitoTokens({ idToken: 'token', accessToken: 'access', nonce: 'the-issued-nonce' })
    ).rejects.toMatchObject({ code: 'nonce_mismatch' });
  });

  it('accepts a token whose nonce claim matches the consumed nonce', async () => {
    (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce({ customerId: undefined });
    mockVerifiedToken('the-issued-nonce');
    mockUser();

    const result = await cognitoService.exchangeCognitoTokens({
      idToken: 'token',
      accessToken: 'access',
      nonce: 'the-issued-nonce',
    });

    expect(result.token).toBe('a');
  });
});

describe('cognitoService.resolveAwsCredentials — config-first with env fallback (I5)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.COGNITO_AWS_ACCESS_KEY_ID;
    delete process.env.COGNITO_AWS_SECRET_ACCESS_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('prefers AWS credentials saved on the config over env vars', async () => {
    process.env.COGNITO_AWS_ACCESS_KEY_ID = 'env-access-key';
    process.env.COGNITO_AWS_SECRET_ACCESS_KEY = 'env-secret-key';

    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'idp-cognito-1',
      enabled: true,
      config: JSON.stringify({
        userPoolId: 'us-east-1_TESTPOOL',
        clientId: 'test-client-id',
        awsAccessKeyId: 'config-access-key',
        awsSecretAccessKey: 'config-secret-key'
      })
    });

    const result = await cognitoService.resolveAwsCredentials();

    expect(result).toEqual({ accessKeyId: 'config-access-key', secretAccessKey: 'config-secret-key' });
  });

  it('falls back to env vars when the config has no AWS credentials saved — removes the "restart the server" requirement in the other direction (env still works)', async () => {
    process.env.COGNITO_AWS_ACCESS_KEY_ID = 'env-access-key';
    process.env.COGNITO_AWS_SECRET_ACCESS_KEY = 'env-secret-key';

    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'idp-cognito-1',
      enabled: true,
      config: JSON.stringify({ userPoolId: 'us-east-1_TESTPOOL', clientId: 'test-client-id' })
    });

    const result = await cognitoService.resolveAwsCredentials();

    expect(result).toEqual({ accessKeyId: 'env-access-key', secretAccessKey: 'env-secret-key' });
  });

  it('returns null when neither the config nor the environment has credentials', async () => {
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'idp-cognito-1',
      enabled: true,
      config: JSON.stringify({ userPoolId: 'us-east-1_TESTPOOL', clientId: 'test-client-id' })
    });

    const result = await cognitoService.resolveAwsCredentials();

    expect(result).toBeNull();
  });

  it('resolves a customer-specific config\'s own AWS credentials — this is what makes "configure via UI" work without a restart, per customer', async () => {
    (prisma.customerIdentityProvider.findFirst as jest.Mock).mockResolvedValue({
      id: 'cust-idp-1',
      customerId: 'cust-1',
      enabled: true,
      config: JSON.stringify({
        userPoolId: 'us-east-1_TenantPool',
        clientId: 'tenant-client-id',
        awsAccessKeyId: 'tenant-access-key',
        awsSecretAccessKey: 'tenant-secret-key'
      })
    });

    const result = await cognitoService.resolveAwsCredentials('cust-1');

    expect(result).toEqual({ accessKeyId: 'tenant-access-key', secretAccessKey: 'tenant-secret-key' });
  });

  describe('hasAwsCredentialsConfigured', () => {
    it('is true when resolveAwsCredentials finds a usable pair', async () => {
      process.env.COGNITO_AWS_ACCESS_KEY_ID = 'env-access-key';
      process.env.COGNITO_AWS_SECRET_ACCESS_KEY = 'env-secret-key';
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-cognito-1',
        enabled: true,
        config: JSON.stringify({ userPoolId: 'us-east-1_TESTPOOL', clientId: 'test-client-id' })
      });

      expect(await cognitoService.hasAwsCredentialsConfigured()).toBe(true);
    });

    it('is false when neither the config nor the environment has credentials', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue({
        id: 'idp-cognito-1',
        enabled: true,
        config: JSON.stringify({ userPoolId: 'us-east-1_TESTPOOL', clientId: 'test-client-id' })
      });

      expect(await cognitoService.hasAwsCredentialsConfigured()).toBe(false);
    });
  });
});

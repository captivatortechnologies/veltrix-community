// Real signature verification for the generic OIDC provider's ID tokens.
// Mints genuinely-signed JWTs with `jose` against a locally-generated RSA
// key pair (never touching the network), and serves that key's public half
// as the mocked `/jwks` response — so `oidcService.verifyIdToken` runs its
// REAL `jose.jwtVerify` code path end to end. Proves: a valid token is
// accepted; a forged/unsigned, expired, wrong-audience, wrong-issuer, or
// nonce-mismatched token is rejected before any user is looked up.

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    identityProvider: { findFirst: jest.fn() },
    customerIdentityProvider: { findFirst: jest.fn() },
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
}));

jest.mock('axios');

import axios from 'axios';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import prisma from '../../../db';
import { oidcService, __resetOidcCachesForTests } from '../oidc.service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const ISSUER = 'https://mock-issuer.e2e.test';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URI = `${ISSUER}/jwks`;
const CLIENT_ID = 'test-client-id';
const KID = 'test-signing-key-1';

const ENABLED_GLOBAL_CONFIG = {
  id: 'idp-oidc-1',
  name: 'Generic OIDC',
  type: 'OIDC',
  enabled: true,
  config: JSON.stringify({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: 'shh-its-a-secret',
    redirectUri: 'https://app.example.com/oauth/callback',
    scope: 'openid email profile',
  }),
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey; // A DIFFERENT key, never published in the served JWKS.
let publicJwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };

  const otherPair = await generateKeyPair('RS256');
  otherPrivateKey = otherPair.privateKey;
});

function mockDiscoveryAndJwks() {
  mockedAxios.get.mockImplementation((url: string) => {
    if (url === DISCOVERY_URL) {
      return Promise.resolve({
        data: { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: JWKS_URI },
      });
    }
    if (url === JWKS_URI) {
      return Promise.resolve({ data: { keys: [publicJwk] } });
    }
    return Promise.reject(new Error(`Unexpected axios.get(${url})`));
  });
}

async function signToken(overrides: Record<string, unknown> = {}, opts: { key?: CryptoKey; expiresIn?: string } = {}): Promise<string> {
  const claims = {
    sub: 'user-sub-1',
    email: 'alice@acme.com',
    email_verified: true,
    name: 'Alice Example',
    given_name: 'Alice',
    family_name: 'Example',
    ...overrides,
  };

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setExpirationTime(opts.expiresIn || '5m')
    .sign(opts.key || privateKey);
}

describe('oidcService.verifyIdToken — real signature verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetOidcCachesForTests();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_GLOBAL_CONFIG);
    mockDiscoveryAndJwks();
  });

  it('accepts a genuinely-signed, correctly-claimed token and returns the OIDC user info', async () => {
    const token = await signToken({ nonce: 'the-nonce' });

    const userInfo = await oidcService.verifyIdToken(token, undefined, 'the-nonce');

    expect(userInfo).toMatchObject({
      email: 'alice@acme.com',
      providerId: 'user-sub-1',
      name: 'Alice Example',
      firstName: 'Alice',
      lastName: 'Example',
      emailVerified: true,
    });
  });

  it('rejects a hand-crafted UNSIGNED (alg:none) token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'attacker', email: 'victim@acme.com', aud: CLIENT_ID, iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const unsignedToken = `${header}.${payload}.`;

    await expect(oidcService.verifyIdToken(unsignedToken)).rejects.toMatchObject({
      code: 'invalid_token',
      message: expect.stringMatching(/signature verification failed/i),
    });
  });

  it('rejects a token signed with a key NOT present in the provider\'s published JWKS', async () => {
    const token = await signToken({}, { key: otherPrivateKey });

    await expect(oidcService.verifyIdToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('rejects an expired token', async () => {
    // `exp` in the past — jose's own claim validation rejects this regardless
    // of the signature being genuinely valid.
    const token = await new SignJWT({ sub: 'user-sub-1', email: 'alice@acme.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    await expect(oidcService.verifyIdToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('rejects a token whose audience does not match the configured clientId', async () => {
    const token = await new SignJWT({ sub: 'user-sub-1', email: 'alice@acme.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience('some-other-client-id')
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(oidcService.verifyIdToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('rejects a token whose issuer does not match the configured issuer', async () => {
    const token = await new SignJWT({ sub: 'user-sub-1', email: 'alice@acme.com' })
      .setProtectedHeader({ alg: 'RS256', kid: KID })
      .setIssuedAt()
      .setIssuer('https://a-completely-different-issuer.test')
      .setAudience(CLIENT_ID)
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(oidcService.verifyIdToken(token)).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('rejects when the token\'s nonce claim does not match the expected (server-issued) nonce', async () => {
    const token = await signToken({ nonce: 'a-different-nonce' });

    await expect(oidcService.verifyIdToken(token, undefined, 'the-real-nonce')).rejects.toMatchObject({
      code: 'nonce_mismatch',
    });
  });

  it('recovers from a rotated signing key by refetching the JWKS once before giving up', async () => {
    // Simulate key rotation: the provider now serves a NEW key, but our
    // token was signed by a key that predates it (matching kid, but the
    // cached JWKS from an earlier call is stale). First getJwks() call
    // during this test returns the CURRENT (rotated) key only; the retry
    // after a JWKSNoMatchingKey should refetch and find the right one.
    const rotatedPair = await generateKeyPair('RS256');
    const rotatedJwk = { ...(await exportJWK(rotatedPair.publicKey)), kid: 'rotated-kid', alg: 'RS256', use: 'sig' };

    let jwksCallCount = 0;
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === DISCOVERY_URL) {
        return Promise.resolve({
          data: { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: JWKS_URI },
        });
      }
      if (url === JWKS_URI) {
        jwksCallCount += 1;
        // First fetch: only the rotated (irrelevant) key. Second fetch (the
        // forced-refresh retry): the real key our token was signed with.
        const keys = jwksCallCount === 1 ? [rotatedJwk] : [rotatedJwk, publicJwk];
        return Promise.resolve({ data: { keys } });
      }
      return Promise.reject(new Error(`Unexpected axios.get(${url})`));
    });

    const token = await signToken();

    const userInfo = await oidcService.verifyIdToken(token);

    expect(userInfo.email).toBe('alice@acme.com');
    expect(jwksCallCount).toBe(2);
  });

  it('rejects when the provider is disabled, without attempting any verification', async () => {
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({ ...ENABLED_GLOBAL_CONFIG, enabled: false });

    await expect(oidcService.verifyIdToken('irrelevant-token')).rejects.toMatchObject({ code: 'provider_disabled' });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

// OIDC discovery (`{issuer}/.well-known/openid-configuration`) + its
// per-issuer cache. Exercised indirectly through getAuthUrl (hot path —
// proves caching) and testConnection (always force-refreshes — proves an
// admin actively testing a config never sees a stale cached failure/success).

jest.mock('axios');

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

// oidc.service.ts imports createOAuthFlowState/consumeOAuthState from
// oauth-state.store.ts, which itself imports the real cacheService (ioredis)
// unless mocked — leaving a live connection-attempt handle open after the
// test run (same class of issue documented in the other providers' tests).
jest.mock('../../../services/cache.service', () => ({
  cacheService: { isReady: jest.fn(() => false), get: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../oauth/oauth-state.store', () => ({
  createOAuthFlowState: jest.fn(),
  consumeOAuthState: jest.fn(),
}));

import axios from 'axios';
import prisma from '../../../db';
import { oidcService, __resetOidcCachesForTests } from '../oidc.service';
import { createOAuthFlowState } from '../../oauth/oauth-state.store';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const ISSUER = 'https://mock-issuer.e2e.test';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const DISCOVERY_DOC = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
};

const ENABLED_GLOBAL_CONFIG = {
  id: 'idp-oidc-1',
  name: 'Generic OIDC',
  type: 'OIDC',
  enabled: true,
  config: JSON.stringify({
    issuer: ISSUER,
    clientId: 'test-client-id',
    clientSecret: 'shh-its-a-secret',
    redirectUri: 'https://app.example.com/oauth/callback',
    scope: 'openid email profile',
  }),
};

describe('oidcService — discovery + caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetOidcCachesForTests();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_GLOBAL_CONFIG);
    (createOAuthFlowState as jest.Mock).mockResolvedValue({ state: 'state-1', nonce: 'nonce-1' });
  });

  describe('getAuthUrl', () => {
    it('builds the authorize URL from the discovered authorization_endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });

      const result = await oidcService.getAuthUrl();

      expect(mockedAxios.get).toHaveBeenCalledWith(DISCOVERY_URL, expect.any(Object));
      expect(result.authUrl.startsWith(`${ISSUER}/authorize?`)).toBe(true);
      const url = new URL(result.authUrl);
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/oauth/callback');
      expect(url.searchParams.get('state')).toBe('state-1');
      expect(url.searchParams.get('nonce')).toBe('nonce-1');
      expect(result.state).toBe('state-1');
    });

    it('rejects with a specific, actionable error when discovery cannot be reached', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await expect(oidcService.getAuthUrl()).rejects.toMatchObject({
        code: 'provider_misconfigured',
      });
    });

    it('caches the discovery document — a second call within the TTL does not refetch', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });

      await oidcService.getAuthUrl();
      await oidcService.getAuthUrl();

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('rejects when the provider is disabled', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({ ...ENABLED_GLOBAL_CONFIG, enabled: false });

      await expect(oidcService.getAuthUrl()).rejects.toMatchObject({ code: 'provider_disabled' });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('rejects with provider_misconfigured when the issuer is not set', async () => {
      (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValueOnce({
        ...ENABLED_GLOBAL_CONFIG,
        config: JSON.stringify({ clientId: 'x', redirectUri: 'https://app.example.com/oauth/callback' }),
      });

      await expect(oidcService.getAuthUrl()).rejects.toMatchObject({ code: 'provider_misconfigured' });
    });
  });

  describe('testConnection', () => {
    it('short-circuits without any network call when issuer/clientId are missing', async () => {
      const result = await oidcService.testConnection({});
      expect(result).toMatchObject({ success: false });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('reports a specific failure when discovery fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));

      const result = await oidcService.testConnection({ issuer: ISSUER, clientId: 'id' });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/issuer url/i);
    });

    it('reports true success when discovery succeeds and the token endpoint accepts the client', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });
      mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });

      const result = await oidcService.testConnection({ issuer: ISSUER, clientId: 'id', clientSecret: 'secret' });

      expect(result.success).toBe(true);
      expect(result.details?.some((d) => /discovery succeeded/i.test(d))).toBe(true);
    });

    it('reports failure with a specific message when the token endpoint rejects the client', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });
      mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_client' } });

      const result = await oidcService.testConnection({ issuer: ISSUER, clientId: 'wrong', clientSecret: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/rejected/i);
    });

    it('always force-refreshes discovery — never reuses getAuthUrl\'s cached document', async () => {
      // Prime the cache via getAuthUrl.
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });
      await oidcService.getAuthUrl();
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // testConnection must still hit the network, not reuse the cached entry.
      mockedAxios.get.mockResolvedValueOnce({ data: DISCOVERY_DOC });
      mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });
      await oidcService.testConnection({ issuer: ISSUER, clientId: 'id', clientSecret: 'secret' });

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });
});

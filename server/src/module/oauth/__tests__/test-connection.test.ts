// I4: test-connection support. probeOAuthClientCredentials uses the
// standard trick of POSTing a bogus authorization_code grant to a
// provider's token endpoint — a wrong client_id/secret is rejected with
// invalid_client/unauthorized_client *before* the code is even inspected,
// while a valid client instead gets invalid_grant (the code itself is
// what's wrong). fetchOidcDiscoveryDocument is a thin reachability check.

jest.mock('axios');

// oauth.utils.ts imports consumeOAuthNonce from oauth-state.store.ts at
// module load regardless of whether this test calls anything nonce-related
// — and that module imports the real cacheService (ioredis client) unless
// mocked, leaving a live connection-attempt handle open after the test run
// (the same class of issue jest.config.js already excludes
// distributed-lock/session-manager/refresh-token-manager tests for).
jest.mock('../../../services/cache.service', () => ({
  cacheService: { isReady: jest.fn(() => false), get: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import axios from 'axios';
import {
  probeOAuthClientCredentials,
  fetchOidcDiscoveryDocument,
  isValidHttpUrl,
  isValidCognitoUserPoolId,
  isValidAwsRegion,
  isValidBareDomain,
  validateGoogleConfig,
  validateMicrosoftConfig,
  validateCognitoConfig,
} from '../oauth.utils';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('probeOAuthClientCredentials', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports credentials accepted when the provider rejects the fake code with invalid_grant', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 400,
      data: { error: 'invalid_grant', error_description: 'The provided authorization code is invalid.' }
    });

    const result = await probeOAuthClientCredentials('https://example.com/token', {
      grant_type: 'authorization_code',
      client_id: 'real-client-id',
      client_secret: 'real-secret',
      code: 'probe',
      redirect_uri: 'https://veltrix.invalid/callback'
    });

    expect(result).toMatchObject({ reachable: true, credentialsAccepted: true, providerErrorCode: 'invalid_grant' });
  });

  it('reports credentials rejected when the provider returns invalid_client', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 401,
      data: { error: 'invalid_client', error_description: 'Client authentication failed.' }
    });

    const result = await probeOAuthClientCredentials('https://example.com/token', {
      grant_type: 'authorization_code',
      client_id: 'wrong-client-id',
      client_secret: 'wrong-secret',
      code: 'probe',
      redirect_uri: 'https://veltrix.invalid/callback'
    });

    expect(result).toMatchObject({ reachable: true, credentialsAccepted: false, providerErrorCode: 'invalid_client' });
  });

  it('reports credentials rejected for unauthorized_client too', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 401, data: { error: 'unauthorized_client' } });

    const result = await probeOAuthClientCredentials('https://example.com/token', {});

    expect(result.credentialsAccepted).toBe(false);
  });

  it('reports unreachable (not a credential rejection) on a network error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND example.com'));

    const result = await probeOAuthClientCredentials('https://unreachable.example.com/token', {});

    expect(result).toMatchObject({ reachable: false, credentialsAccepted: false });
    expect(result.errorMessage).toMatch(/ENOTFOUND/);
  });

  it('treats a 200 with no error field as accepted (unusual, but not a rejection)', async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { access_token: 'unexpected' } });

    const result = await probeOAuthClientCredentials('https://example.com/token', {});

    expect(result).toMatchObject({ reachable: true, credentialsAccepted: true });
  });
});

describe('fetchOidcDiscoveryDocument', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the parsed discovery document on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://example.com', token_endpoint: 'https://example.com/token' } });

    const result = await fetchOidcDiscoveryDocument('https://example.com/.well-known/openid-configuration');

    expect(result).toMatchObject({ issuer: 'https://example.com' });
  });

  it('returns null (never throws) when the discovery endpoint is unreachable', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchOidcDiscoveryDocument('https://unreachable.example.com/.well-known/openid-configuration');

    expect(result).toBeNull();
  });
});

// I4: config-save validation beyond mere presence.
describe('config validators', () => {
  describe('isValidHttpUrl', () => {
    it('accepts http(s) URLs', () => {
      expect(isValidHttpUrl('https://app.example.com/oauth/callback')).toBe(true);
      expect(isValidHttpUrl('http://localhost:5173/oauth/callback')).toBe(true);
    });

    it('rejects non-URLs and non-http(s) schemes', () => {
      expect(isValidHttpUrl('not a url')).toBe(false);
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
      expect(isValidHttpUrl('ftp://example.com')).toBe(false);
      expect(isValidHttpUrl('')).toBe(false);
    });
  });

  describe('isValidCognitoUserPoolId', () => {
    it('accepts the real Cognito shape (<region>_<id>)', () => {
      expect(isValidCognitoUserPoolId('us-east-1_AbCdEfGhI')).toBe(true);
      expect(isValidCognitoUserPoolId('eu-west-2_1234567')).toBe(true);
    });

    it('rejects a bare pool id, a domain, or a region with no id', () => {
      expect(isValidCognitoUserPoolId('AbCdEfGhI')).toBe(false);
      expect(isValidCognitoUserPoolId('myapp.auth.us-east-1.amazoncognito.com')).toBe(false);
      expect(isValidCognitoUserPoolId('us-east-1_')).toBe(false);
    });
  });

  describe('isValidAwsRegion', () => {
    it('accepts real region codes', () => {
      expect(isValidAwsRegion('us-east-1')).toBe(true);
      expect(isValidAwsRegion('ap-southeast-2')).toBe(true);
    });

    it('rejects malformed region codes', () => {
      expect(isValidAwsRegion('US-EAST-1')).toBe(false);
      expect(isValidAwsRegion('useast1')).toBe(false);
      expect(isValidAwsRegion('')).toBe(false);
    });
  });

  describe('isValidBareDomain', () => {
    it('accepts a bare host name', () => {
      expect(isValidBareDomain('myapp.auth.us-east-1.amazoncognito.com')).toBe(true);
      expect(isValidBareDomain('acme.com')).toBe(true);
    });

    it('rejects a value with a scheme or a path (the classic "pasted the whole URL" mistake)', () => {
      expect(isValidBareDomain('https://myapp.auth.us-east-1.amazoncognito.com')).toBe(false);
      expect(isValidBareDomain('myapp.auth.us-east-1.amazoncognito.com/oauth2')).toBe(false);
    });
  });

  describe('validateGoogleConfig', () => {
    it('accepts a well-formed redirect URI', () => {
      expect(validateGoogleConfig({ redirectUri: 'https://app.example.com/oauth/callback' })).toMatchObject({ valid: true });
    });

    it('rejects a malformed redirect URI with a specific message', () => {
      const result = validateGoogleConfig({ redirectUri: 'not-a-url' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/redirect uri/i);
    });
  });

  describe('validateMicrosoftConfig', () => {
    it('accepts "common", a GUID, or a verified domain as tenantId', () => {
      expect(validateMicrosoftConfig({ tenantId: 'common' }).valid).toBe(true);
      expect(validateMicrosoftConfig({ tenantId: '11111111-2222-3333-4444-555555555555' }).valid).toBe(true);
      expect(validateMicrosoftConfig({ tenantId: 'acme.onmicrosoft.com' }).valid).toBe(true);
    });

    it('rejects a nonsense tenantId', () => {
      const result = validateMicrosoftConfig({ tenantId: 'not a tenant id!!' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/tenant id/i);
    });
  });

  describe('validateCognitoConfig', () => {
    it('accepts a fully well-formed config', () => {
      const result = validateCognitoConfig({
        userPoolId: 'us-east-1_AbCdEfGhI',
        userPoolRegion: 'us-east-1',
        redirectUri: 'https://app.example.com/auth/cognito/callback',
        logoutUri: 'https://app.example.com',
        domain: 'myapp.auth.us-east-1.amazoncognito.com'
      });
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('rejects a malformed User Pool ID, region, and domain-with-scheme all at once, with specific messages for each', () => {
      const result = validateCognitoConfig({
        userPoolId: 'not-a-pool-id',
        userPoolRegion: 'US-EAST-1',
        domain: 'https://myapp.auth.us-east-1.amazoncognito.com'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        expect.stringMatching(/user pool id/i),
        expect.stringMatching(/region/i),
        expect.stringMatching(/domain/i)
      ]);
    });
  });
});

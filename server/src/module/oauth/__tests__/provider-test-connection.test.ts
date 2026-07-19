// I4: per-provider testConnection() orchestration (discovery fetch + client
// credential probe, both already unit-tested directly in
// test-connection.test.ts). This confirms each provider's service wires
// those primitives together correctly and short-circuits on missing fields
// without making any network call.

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

// Each service imports oauth-state.store.ts (for state/nonce, unused by
// testConnection) which imports the real cacheService (ioredis) unless
// mocked — leaving a live connection-attempt handle open after the test
// run. See the identical comment in test-connection.test.ts.
jest.mock('../../../services/cache.service', () => ({
  cacheService: { isReady: jest.fn(() => false), get: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import axios from 'axios';
import { googleService } from '../../google/google.service';
import { microsoftService } from '../../microsoft/microsoft.service';
import { cognitoService } from '../../cognito/cognito.service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('googleService.testConnection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('short-circuits when Client ID/Secret are missing, without any network call', async () => {
    const result = await googleService.testConnection({});
    expect(result).toMatchObject({ success: false });
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('reports success when discovery is reachable and the credential probe accepts the client', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://accounts.google.com' } });
    mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });

    const result = await googleService.testConnection({ clientId: 'id', clientSecret: 'secret' });

    expect(result.success).toBe(true);
  });

  it('reports failure with a specific message when the credential probe rejects the client', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://accounts.google.com' } });
    mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_client' } });

    const result = await googleService.testConnection({ clientId: 'wrong', clientSecret: 'wrong' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/rejected/i);
  });
});

describe('microsoftService.testConnection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('short-circuits when Client ID/Secret are missing, without any network call', async () => {
    const result = await microsoftService.testConnection({});
    expect(result).toMatchObject({ success: false });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('reports a specific failure when the tenant discovery document is unreachable', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('404'));

    const result = await microsoftService.testConnection({ clientId: 'id', clientSecret: 'secret', tenantId: 'bad-tenant' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/tenant/i);
  });

  it('reports success when the tenant is found and the credential probe accepts the client', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://login.microsoftonline.com/common/v2.0' } });
    mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });

    const result = await microsoftService.testConnection({ clientId: 'id', clientSecret: 'secret', tenantId: 'common' });

    expect(result.success).toBe(true);
  });
});

describe('cognitoService.testConnection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('short-circuits when User Pool ID/Client ID are missing, without any network call', async () => {
    const result = await cognitoService.testConnection({});
    expect(result).toMatchObject({ success: false });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('reports the pool is reachable but sign-in is incomplete when no Hosted UI domain is configured', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Test' } });

    const result = await cognitoService.testConnection({ userPoolId: 'us-east-1_Test', userPoolRegion: 'us-east-1', clientId: 'id' });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/domain/i);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('reports success end-to-end when the pool exists and the domain accepts the client credentials', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Test' } });
    mockedAxios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });

    const result = await cognitoService.testConnection({
      userPoolId: 'us-east-1_Test',
      userPoolRegion: 'us-east-1',
      clientId: 'id',
      clientSecret: 'secret',
      domain: 'myapp.auth.us-east-1.amazoncognito.com'
    });

    expect(result.success).toBe(true);
  });

  it('reports a specific failure when the user pool itself cannot be found', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('404'));

    const result = await cognitoService.testConnection({ userPoolId: 'us-east-1_Nonexistent', userPoolRegion: 'us-east-1', clientId: 'id' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not find user pool/i);
  });
});

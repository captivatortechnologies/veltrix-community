import { describe, it, expect, beforeEach, vi } from 'vitest';
import { oidcService } from '../oidcService';

vi.mock('../authService', () => ({
  authAxios: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { authAxios } from '../authService';

const mockedAuthAxios = authAxios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('oidcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('getConfig fetches GET /oidc (public endpoint, works whether or not a token exists)', async () => {
    mockedAuthAxios.get.mockResolvedValueOnce({
      data: { enabled: true, issuer: 'https://issuer.example.com', clientId: 'id', clientSecret: '', hasClientSecret: true, redirectUri: '', scope: '' },
    });

    const config = await oidcService.getConfig();

    expect(mockedAuthAxios.get).toHaveBeenCalledWith('/oidc', { params: undefined });
    expect(config.issuer).toBe('https://issuer.example.com');
    expect(config.hasClientSecret).toBe(true);
  });

  it('getConfig forwards an emailHint so an anonymous pre-login caller can resolve a customer-specific config', async () => {
    mockedAuthAxios.get.mockResolvedValueOnce({
      data: { enabled: true, issuer: 'https://tenant-issuer.example.com', clientId: 'id', clientSecret: '', hasClientSecret: true, redirectUri: '', scope: '', isCustomerSpecific: true },
    });

    const config = await oidcService.getConfig('someone@acme.com');

    expect(mockedAuthAxios.get).toHaveBeenCalledWith('/oidc', { params: { emailHint: 'someone@acme.com' } });
    expect(config.isCustomerSpecific).toBe(true);
  });

  it('getAuthUrl forwards emailHint for per-tenant config resolution (I3)', async () => {
    mockedAuthAxios.get.mockResolvedValueOnce({ data: { authUrl: 'https://issuer.example.com/authorize?x=1', state: 'state-1' } });

    const result = await oidcService.getAuthUrl('alice@acme.com');

    expect(mockedAuthAxios.get).toHaveBeenCalledWith('/oidc/auth-url', { params: { emailHint: 'alice@acme.com' } });
    expect(result.state).toBe('state-1');
  });

  it('handleCallback posts code/redirectUri/state', async () => {
    mockedAuthAxios.post.mockResolvedValueOnce({ data: { idToken: 'id-tok', accessToken: 'access-tok', nonce: 'nonce-1' } });

    const tokens = await oidcService.handleCallback('auth-code', 'https://app.example.com/oauth/callback', 'state-1');

    expect(mockedAuthAxios.post).toHaveBeenCalledWith('/oidc/handle-callback', {
      code: 'auth-code',
      redirectUri: 'https://app.example.com/oauth/callback',
      state: 'state-1',
    });
    expect(tokens.nonce).toBe('nonce-1');
  });

  it('exchangeTokens posts idToken/accessToken/nonce', async () => {
    mockedAuthAxios.post.mockResolvedValueOnce({
      data: { token: 'jwt', refresh_token: 'r', token_type: 'Bearer', expires_in: 900, refresh_expires_in: 604800, user: { authProvider: 'OIDC' } },
    });

    const result = await oidcService.exchangeTokens('id-tok', 'access-tok', 'nonce-1');

    expect(mockedAuthAxios.post).toHaveBeenCalledWith('/oidc/token-exchange', { idToken: 'id-tok', accessToken: 'access-tok', nonce: 'nonce-1' });
    expect(result.user.authProvider).toBe('OIDC');
  });

  it('saveConfig posts the full config payload', async () => {
    mockedAuthAxios.post.mockResolvedValueOnce({ data: { success: true } });

    const result = await oidcService.saveConfig({
      enabled: true,
      issuer: 'https://issuer.example.com',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/oauth/callback',
      scope: 'openid email profile',
      isCustomerSpecific: true,
      jitMode: 'domain-match',
    });

    expect(result.success).toBe(true);
    expect(mockedAuthAxios.post).toHaveBeenCalledWith(
      '/oidc/config',
      expect.objectContaining({ issuer: 'https://issuer.example.com', jitMode: 'domain-match' })
    );
  });

  it('testConnection returns a network-failure fallback instead of throwing', async () => {
    mockedAuthAxios.post.mockRejectedValueOnce(new Error('network down'));

    const result = await oidcService.testConnection({ issuer: 'https://issuer.example.com', clientId: 'id', clientSecret: 'secret' });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/failed to reach the server/i);
  });

  it('resetConfig issues a DELETE', async () => {
    mockedAuthAxios.delete.mockResolvedValueOnce({ data: { success: true } });

    const result = await oidcService.resetConfig();

    expect(mockedAuthAxios.delete).toHaveBeenCalledWith('/oidc/config/reset');
    expect(result.success).toBe(true);
  });

  it('initiateLogin stores redirect uri + state in sessionStorage and redirects the browser', async () => {
    mockedAuthAxios.get.mockResolvedValueOnce({ data: { authUrl: 'https://issuer.example.com/authorize?x=1', state: 'state-xyz' } });

    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: 'http://localhost/login' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    try {
      await oidcService.initiateLogin('alice@acme.com');

      expect(sessionStorage.getItem('oidc_oauth_state')).toBe('state-xyz');
      expect(sessionStorage.getItem('oidc_redirect_uri')).toContain('/oauth/callback');
      expect(mockLocation.href).toBe('https://issuer.example.com/authorize?x=1');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});

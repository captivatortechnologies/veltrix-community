// I1: Microsoft's auth-url -> handle-callback -> token-exchange chain is
// bound by server-side state (CSRF/replay) and nonce (OIDC substitution
// protection), mirroring google.service.ts.

jest.mock('../../../db', () => ({
  __esModule: true,
  default: {
    identityProvider: { findFirst: jest.fn() },
    customerIdentityProvider: { findFirst: jest.fn() },
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

jest.mock('../../oauth/oauth-state.store', () => ({
  createOAuthFlowState: jest.fn(),
  consumeOAuthState: jest.fn(),
  consumeOAuthNonce: jest.fn(),
}));

const mockGetAuthCodeUrl = jest.fn();
const mockAcquireTokenByCode = jest.fn();

jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({
    getAuthCodeUrl: mockGetAuthCodeUrl,
    acquireTokenByCode: mockAcquireTokenByCode,
  })),
}));

import prisma from '../../../db';
import { microsoftService } from '../microsoft.service';
import { createOAuthFlowState, consumeOAuthState } from '../../oauth/oauth-state.store';

const ENABLED_MS_CONFIG = {
  id: 'idp-azure-1',
  enabled: true,
  config: JSON.stringify({
    clientId: 'ms-client-id',
    clientSecret: 'ms-client-secret',
    tenantId: 'common',
    redirectUri: 'https://app.example.com/oauth/callback',
    scope: 'openid email profile User.Read',
    authority: 'https://login.microsoftonline.com/common',
  }),
};

describe('microsoftService — state/nonce wiring (I1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_MS_CONFIG);
  });

  describe('getAuthUrl', () => {
    it('mints server-side state+nonce and embeds the nonce in the authorize URL request', async () => {
      (createOAuthFlowState as jest.Mock).mockResolvedValueOnce({ state: 'state-123', nonce: 'nonce-456' });
      mockGetAuthCodeUrl.mockResolvedValue('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?...');

      const result = await microsoftService.getAuthUrl();

      expect(createOAuthFlowState).toHaveBeenCalledWith('AZURE', undefined);
      expect(mockGetAuthCodeUrl).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'state-123', nonce: 'nonce-456' })
      );
      expect(result.state).toBe('state-123');
    });
  });

  describe('handleCallback', () => {
    it('rejects a callback whose state was never issued (or was already consumed)', async () => {
      (consumeOAuthState as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        microsoftService.handleCallback({ code: 'auth-code', redirectUri: 'https://app.example.com/oauth/callback', state: 'unknown-state' })
      ).rejects.toMatchObject({ code: 'invalid_state' });

      expect(mockAcquireTokenByCode).not.toHaveBeenCalled();
    });

    it('exchanges the code for tokens and hands the bound nonce back to the caller', async () => {
      (consumeOAuthState as jest.Mock).mockResolvedValueOnce({ nonce: 'nonce-456', customerId: undefined });
      mockAcquireTokenByCode.mockResolvedValue({
        idToken: 'id.tok',
        accessToken: 'access.tok',
        idTokenClaims: { nonce: 'nonce-456' },
      });

      const result = await microsoftService.handleCallback({
        code: 'auth-code',
        redirectUri: 'https://app.example.com/oauth/callback',
        state: 'state-123',
      });

      expect(result).toMatchObject({ idToken: 'id.tok', accessToken: 'access.tok', nonce: 'nonce-456' });
    });

    it('rejects when the returned ID token nonce claim does not match the one this server issued', async () => {
      (consumeOAuthState as jest.Mock).mockResolvedValueOnce({ nonce: 'nonce-456', customerId: undefined });
      mockAcquireTokenByCode.mockResolvedValue({
        idToken: 'id.tok',
        accessToken: 'access.tok',
        idTokenClaims: { nonce: 'a-different-nonce' },
      });

      await expect(
        microsoftService.handleCallback({
          code: 'auth-code',
          redirectUri: 'https://app.example.com/oauth/callback',
          state: 'state-123',
        })
      ).rejects.toMatchObject({ code: 'nonce_mismatch' });
    });
  });
});

// I1: Google's auth-url -> handle-callback -> token-exchange chain is now
// bound by server-side state (CSRF/replay) and nonce (OIDC substitution
// protection). This suite proves the wiring: state is minted at auth-url,
// validated+consumed at handle-callback, and the resulting nonce must both
// (a) be consumed exactly once at token-exchange and (b) match the ID
// token's own `nonce` claim.

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

const mockGenerateAuthUrl = jest.fn();
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import prisma from '../../../db';
import { googleService } from '../google.service';
import { createOAuthFlowState, consumeOAuthState, consumeOAuthNonce } from '../../oauth/oauth-state.store';

const ENABLED_GOOGLE_CONFIG = {
  id: 'idp-google-1',
  enabled: true,
  config: JSON.stringify({
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    redirectUri: 'https://app.example.com/oauth/callback',
    scope: 'openid email profile',
  }),
};

describe('googleService — state/nonce wiring (I1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.identityProvider.findFirst as jest.Mock).mockResolvedValue(ENABLED_GOOGLE_CONFIG);
  });

  describe('getAuthUrl', () => {
    it('mints server-side state+nonce and embeds the nonce in the authorize URL', async () => {
      (createOAuthFlowState as jest.Mock).mockResolvedValueOnce({ state: 'state-123', nonce: 'nonce-456' });
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...');

      const result = await googleService.getAuthUrl();

      expect(createOAuthFlowState).toHaveBeenCalledWith('GOOGLE', undefined);
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'state-123', nonce: 'nonce-456' })
      );
      expect(result.state).toBe('state-123');
    });
  });

  describe('handleCallback', () => {
    it('rejects a callback whose state was never issued (or was already consumed)', async () => {
      (consumeOAuthState as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        googleService.handleCallback({ code: 'auth-code', redirectUri: 'https://app.example.com/oauth/callback', state: 'unknown-state' })
      ).rejects.toMatchObject({ code: 'invalid_state' });

      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('exchanges the code for tokens and hands the bound nonce back to the caller', async () => {
      (consumeOAuthState as jest.Mock).mockResolvedValueOnce({ nonce: 'nonce-456', customerId: undefined });
      mockGetToken.mockResolvedValue({ tokens: { id_token: 'id.tok', access_token: 'access.tok', refresh_token: 'refresh.tok' } });

      const result = await googleService.handleCallback({
        code: 'auth-code',
        redirectUri: 'https://app.example.com/oauth/callback',
        state: 'state-123',
      });

      expect(result).toMatchObject({ idToken: 'id.tok', accessToken: 'access.tok', nonce: 'nonce-456' });
    });
  });

  describe('exchangeGoogleTokens', () => {
    it('rejects when the ID token nonce claim does not match the expected nonce', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'user@tenant.test', sub: 'sub-1', nonce: 'wrong-nonce' }),
      });

      await expect(
        googleService.exchangeGoogleTokens({ idToken: 'id.tok', accessToken: 'access.tok', nonce: 'expected-nonce' })
      ).rejects.toMatchObject({ code: 'nonce_mismatch' });

      // Nonce consumption in exchangeTokensForJWT should never be reached —
      // the claim check fails first.
      expect(consumeOAuthNonce).not.toHaveBeenCalled();
    });

    it('rejects when the nonce was already consumed (replay) at exchange time', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'user@tenant.test', sub: 'sub-1', nonce: 'expected-nonce' }),
      });
      (consumeOAuthNonce as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        googleService.exchangeGoogleTokens({ idToken: 'id.tok', accessToken: 'access.tok', nonce: 'expected-nonce' })
      ).rejects.toMatchObject({ code: 'invalid_nonce' });
    });
  });
});

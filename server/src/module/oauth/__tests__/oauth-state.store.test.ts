// I1: server-side state/nonce tracking for the SSO auth-url -> handle-callback
// -> token-exchange chain. These tests run against the in-memory fallback
// (no Redis needed), which is what cacheService.isReady() returns in the
// test environment.

jest.mock('../../../services/cache.service', () => ({
  cacheService: {
    isReady: jest.fn(() => false),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    getAndDelete: jest.fn(),
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

import { cacheService } from '../../../services/cache.service';
import {
  createOAuthFlowState,
  consumeOAuthState,
  consumeOAuthNonce,
  validateState,
  generateState,
  __resetOAuthStateStoreForTests,
} from '../oauth-state.store';

const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('oauth-state.store', () => {
  beforeEach(() => {
    __resetOAuthStateStoreForTests();
    jest.clearAllMocks();
    mockCacheService.isReady.mockReturnValue(false);
  });

  describe('generateState / validateState', () => {
    it('generates unique, non-empty opaque values', () => {
      const a = generateState();
      const b = generateState();
      expect(a).toEqual(expect.any(String));
      expect(a.length).toBeGreaterThan(16);
      expect(a).not.toBe(b);
    });

    it('validateState matches only identical, non-empty values', () => {
      expect(validateState('abc', 'abc')).toBe(true);
      expect(validateState('abc', 'def')).toBe(false);
      expect(validateState('', 'abc')).toBe(false);
      expect(validateState('abc', '')).toBe(false);
    });
  });

  describe('createOAuthFlowState / consumeOAuthState', () => {
    it('round-trips: a state issued for a provider is consumable exactly once for that provider', async () => {
      const { state, nonce } = await createOAuthFlowState('GOOGLE', 'cust-1');
      expect(state).toEqual(expect.any(String));
      expect(nonce).toEqual(expect.any(String));
      expect(state).not.toBe(nonce);

      const consumed = await consumeOAuthState(state, 'GOOGLE');
      expect(consumed).toEqual({ nonce, customerId: 'cust-1' });
    });

    it('round-trips arbitrary bound metadata (used by connection onboarding)', async () => {
      const metadata = {
        appId: 'defender-endpoint',
        environmentId: 'env-1',
        connectionName: 'Prod',
        settings: { azure_cloud: 'commercial' },
      };
      const { state } = await createOAuthFlowState('connection-onboarding', 'cust-9', metadata);

      const consumed = await consumeOAuthState(state, 'connection-onboarding');
      expect(consumed).not.toBeNull();
      expect(consumed!.customerId).toBe('cust-9');
      expect(consumed!.metadata).toEqual(metadata);
    });

    it('rejects an unknown state (never issued)', async () => {
      const result = await consumeOAuthState('never-issued-state', 'GOOGLE');
      expect(result).toBeNull();
    });

    it('rejects a replayed state (already consumed once)', async () => {
      const { state } = await createOAuthFlowState('MICROSOFT');
      const first = await consumeOAuthState(state, 'MICROSOFT');
      expect(first).not.toBeNull();

      const second = await consumeOAuthState(state, 'MICROSOFT');
      expect(second).toBeNull();
    });

    it('rejects a state issued for a different provider (provider confusion)', async () => {
      const { state } = await createOAuthFlowState('GOOGLE');
      const result = await consumeOAuthState(state, 'AZURE');
      expect(result).toBeNull();
    });

    it('carries no customerId when the flow was not tenant-scoped', async () => {
      const { state } = await createOAuthFlowState('COGNITO');
      const result = await consumeOAuthState(state, 'COGNITO');
      expect(result).toEqual({ nonce: expect.any(String), customerId: undefined });
    });
  });

  describe('consumeOAuthNonce', () => {
    it('is only consumable after the matching state was consumed (two-hop binding)', async () => {
      const { state } = await createOAuthFlowState('GOOGLE', 'cust-9');
      // Before the callback consumes state, the nonce isn't in the nonce
      // bucket yet — an attacker who somehow guessed a nonce can't use it.
      const { nonce } = await createOAuthFlowState('GOOGLE'); // unrelated nonce, never promoted
      const premature = await consumeOAuthNonce(nonce, 'GOOGLE');
      // This nonce was never promoted via consumeOAuthState, so it must fail.
      expect(premature).toBeNull();

      const { nonce: realNonce } = (await consumeOAuthState(state, 'GOOGLE'))!;
      const result = await consumeOAuthNonce(realNonce, 'GOOGLE');
      expect(result).toEqual({ customerId: 'cust-9' });
    });

    it('rejects a replayed nonce (already consumed once) — blocks token-exchange replay', async () => {
      const { state } = await createOAuthFlowState('AZURE');
      const { nonce } = (await consumeOAuthState(state, 'AZURE'))!;

      const first = await consumeOAuthNonce(nonce, 'AZURE');
      expect(first).not.toBeNull();

      const second = await consumeOAuthNonce(nonce, 'AZURE');
      expect(second).toBeNull();
    });

    it('rejects a nonce presented for the wrong provider', async () => {
      const { state } = await createOAuthFlowState('GOOGLE');
      const { nonce } = (await consumeOAuthState(state, 'GOOGLE'))!;

      const result = await consumeOAuthNonce(nonce, 'AZURE');
      expect(result).toBeNull();
    });

    it('rejects an unknown/never-issued nonce', async () => {
      const result = await consumeOAuthNonce('made-up-nonce', 'GOOGLE');
      expect(result).toBeNull();
    });
  });

  // Consuming a one-time-use state/nonce via a separate get() + delete() pair
  // is a real TOCTOU race under concurrent callers (e.g. React StrictMode's
  // intentional double-invoked effects hitting OAuthCallbackPage.tsx's SSO
  // callback handler twice) — both could see the value as still present
  // before either deletes it. storeTake uses cacheService.getAndDelete (a
  // single atomic Redis GETDEL) instead; these tests run with Redis
  // "connected" (isReady: true) to prove that's the path actually taken.
  describe('with Redis connected (isReady: true) — atomic consumption', () => {
    beforeEach(() => {
      mockCacheService.isReady.mockReturnValue(true);
    });

    it('consumeOAuthState uses the atomic getAndDelete, never a separate get()+delete() pair', async () => {
      let stored: unknown;
      mockCacheService.set.mockImplementation(async (_key, value) => {
        stored = value;
        return true;
      });
      mockCacheService.getAndDelete.mockImplementation(async () => stored ?? null);

      const { state, nonce } = await createOAuthFlowState('GOOGLE', 'cust-1');
      const result = await consumeOAuthState(state, 'GOOGLE');

      expect(result).toEqual({ nonce, customerId: 'cust-1' });
      expect(mockCacheService.getAndDelete).toHaveBeenCalledTimes(1);
      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockCacheService.delete).not.toHaveBeenCalled();
    });

    it('two concurrent consumers of the same state cannot both succeed (simulates the StrictMode double-effect race)', async () => {
      let stored: unknown = { state: 'the-state', nonce: 'the-nonce', providerType: 'GOOGLE', createdAt: Date.now() };
      // Mirrors real GETDEL semantics: exactly one caller ever observes the
      // value — the second sees it already gone, regardless of call order.
      mockCacheService.getAndDelete.mockImplementation(async () => {
        const value = stored;
        stored = undefined;
        return value ?? null;
      });

      const [first, second] = await Promise.all([
        consumeOAuthState('the-state', 'GOOGLE'),
        consumeOAuthState('the-state', 'GOOGLE'),
      ]);

      const results = [first, second];
      expect(results.filter((r) => r !== null)).toHaveLength(1);
      expect(results.filter((r) => r === null)).toHaveLength(1);
    });
  });
});

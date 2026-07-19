import { randomBytes } from 'crypto';
import { cacheService } from '../../services/cache.service';
import { loggerService } from '../logger/logger.service';

// ---------------------------------------------------------------------------
// I1: server-side OAuth `state` + OIDC `nonce` tracking.
//
// Ground truth: `validateState()` in oauth.utils.ts was defined but never
// called anywhere — there was no server-side record of which `state` values
// this server actually issued, so nothing could be validated against. Worse,
// the SSO token-exchange endpoints (`/google/token-exchange`,
// `/microsoft/token-exchange`, `/cognito/token-exchange`) are fully public
// and accept a bare `{ idToken, accessToken }` — an attacker could obtain a
// legitimately-signed ID token for their OWN account via a completely
// unrelated OAuth flow (e.g. a rogue site running the provider's JS SDK) and
// POST it directly to our token-exchange endpoint (a token-substitution /
// "login CSRF" attack), since signature verification alone doesn't prove the
// token resulted from a flow *this server* initiated.
//
// This module closes that gap with the standard two-hop OIDC binding:
//  1. `/auth-url` mints a one-time `state` (returned to the browser, used for
//     the existing client-side CSRF check) bound server-side to a fresh
//     `nonce` (embedded in the provider's authorize URL) and the resolved
//     `customerId` (I3 per-tenant config resolution).
//  2. `/handle-callback` consumes the `state` (one-time; a replay or unknown
//     value is rejected) and hands the bound `nonce` back to the caller.
//  3. `/token-exchange` consumes the `nonce` (one-time) to prove the caller
//     is continuing a flow this server actually brokered, and — where the
//     provider's ID token carries a `nonce` claim (Google, Cognito) — that
//     claim is compared against it too.
//
// Storage: Redis (via the existing cacheService) when connected, so state
// survives across server instances/restarts within its TTL; otherwise an
// in-memory Map, so this works with zero external dependencies in dev/test.
// Both paths enforce one-time use and a TTL.
// ---------------------------------------------------------------------------

const STATE_PREFIX = 'oauth:state:';
const NONCE_PREFIX = 'oauth:nonce:';
const TTL_SECONDS = 10 * 60; // 10 minutes — generous for a hosted-UI redirect + user login, short enough to bound replay risk.

export interface OAuthFlowRecord {
  providerType: string;
  customerId?: string;
  createdAt: number;
  /**
   * Arbitrary caller-bound context, carried on the one-time `state` and
   * returned verbatim by `consumeOAuthState`. Used by flows whose callback
   * redirect URI is fixed (e.g. connection onboarding), so per-request context
   * — appId, environmentId, the connection name, collected settings — must
   * ride in `state` rather than the URL. Opaque to this store.
   */
  metadata?: Record<string, unknown>;
}

export interface StateRecord extends OAuthFlowRecord {
  state: string;
  nonce: string;
}

/**
 * Generate a random state/nonce value for CSRF / replay protection.
 * (Moved here from oauth.utils.ts, which re-exports it for backward
 * compatibility with existing callers.)
 */
export function generateState(): string {
  return generateOpaqueValue();
}

/**
 * Constant-shape comparison of a provided state against the server's
 * on-record state. Exists as its own function (rather than inlining `===`)
 * so every call site that "validates state" reads the same way and so this
 * exact check is what the ground-truth investigation found defined-but-
 * unused — it is now the check `consumeOAuthState` runs on every callback.
 */
export function validateState(providedState: string, storedState: string): boolean {
  return Boolean(providedState) && Boolean(storedState) && providedState === storedState;
}

interface InMemoryEntry<T> {
  value: T;
  expiresAt: number;
}

/** In-memory fallback store — used whenever Redis isn't connected. */
class InMemoryTtlStore {
  private entries = new Map<string, InMemoryEntry<unknown>>();

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** Fetch-and-delete (one-time use). Returns null if missing or expired. */
  take<T>(key: string): T | null {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) return null;
    return entry.value as T;
  }
}

const memoryStore = new InMemoryTtlStore();

async function storeSet<T>(key: string, value: T): Promise<void> {
  if (cacheService.isReady()) {
    const ok = await cacheService.set(key, value, TTL_SECONDS);
    if (ok) return;
  }
  memoryStore.set(key, value, TTL_SECONDS);
}

/**
 * Fetch-and-delete (one-time use) from whichever backend has the entry.
 * Uses `cacheService.getAndDelete` (a single atomic Redis `GETDEL`) rather
 * than a separate get-then-delete pair — two concurrent callers racing a
 * plain get+delete could both observe the value as present before either
 * deletes it, defeating one-time-use. Two concurrent callers against the
 * in-memory fallback can't race the same way: `InMemoryTtlStore.take` has
 * no `await` between its `get`/`delete`, so it's already atomic within
 * Node's single-threaded event loop.
 */
async function storeTake<T>(key: string): Promise<T | null> {
  if (cacheService.isReady()) {
    const value = await cacheService.getAndDelete<T>(key);
    if (value !== null) {
      return value;
    }
  }
  return memoryStore.take<T>(key);
}

function generateOpaqueValue(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Begin an OAuth/OIDC flow: mint a `state` (for the client's own CSRF
 * check + server-side callback binding) and a `nonce` (embedded in the
 * provider's authorize URL, later compared against the returned ID token).
 */
export async function createOAuthFlowState(
  providerType: string,
  customerId?: string,
  metadata?: Record<string, unknown>
): Promise<{ state: string; nonce: string }> {
  const state = generateState();
  const nonce = generateState();

  const record: StateRecord = {
    state,
    nonce,
    providerType,
    customerId,
    createdAt: Date.now(),
    ...(metadata ? { metadata } : {}),
  };

  await storeSet(STATE_PREFIX + state, record);

  return { state, nonce };
}

/**
 * Consume a `state` returned from the provider's callback. One-time use —
 * a missing, expired, replayed, or provider-mismatched state is rejected
 * (returns null). On success, the bound `nonce` is "promoted" into the nonce
 * bucket so the subsequent token-exchange call can consume it.
 */
export async function consumeOAuthState(
  state: string,
  providerType: string
): Promise<{ nonce: string; customerId?: string; metadata?: Record<string, unknown> } | null> {
  if (!state) return null;

  const record = await storeTake<StateRecord>(STATE_PREFIX + state);

  // The record is stored keyed by `state`, so a lookup hit already implies
  // equality — `validateState` is still run explicitly so the "does the
  // provided state match what we issued" check is a real, visible function
  // call (rather than an implicit property of the storage key), matching
  // what any future caller/refactor should also do to stay correct.
  if (!record || !validateState(state, record.state) || record.providerType !== providerType) {
    loggerService.warn(`OAuth state validation failed for provider ${providerType}: unknown, expired, or replayed state`);
    return null;
  }

  const nonceRecord: OAuthFlowRecord = {
    providerType: record.providerType,
    customerId: record.customerId,
    createdAt: record.createdAt,
  };
  await storeSet(NONCE_PREFIX + record.nonce, nonceRecord);

  return { nonce: record.nonce, customerId: record.customerId, metadata: record.metadata };
}

/**
 * Consume a `nonce` at token-exchange time. One-time use — a missing,
 * expired, replayed, or provider-mismatched nonce is rejected (returns
 * null), which blocks token-substitution attempts against the public
 * token-exchange endpoints.
 */
export async function consumeOAuthNonce(
  nonce: string,
  providerType: string
): Promise<{ customerId?: string } | null> {
  if (!nonce) return null;

  const record = await storeTake<OAuthFlowRecord>(NONCE_PREFIX + nonce);

  if (!record || record.providerType !== providerType) {
    loggerService.warn(`OAuth nonce validation failed for provider ${providerType}: unknown, expired, or replayed nonce`);
    return null;
  }

  return { customerId: record.customerId };
}

/** Exposed for tests only — clears the in-memory fallback store. */
export function __resetOAuthStateStoreForTests(): void {
  (memoryStore as unknown as { entries: Map<string, unknown> }).entries.clear();
}

import { randomBytes } from 'crypto';
import { sign, SignOptions } from 'jsonwebtoken';
import axios from 'axios';
import { config } from '../../config';
import { loggerService } from '../logger/logger.service';
import prisma from '../../db';
import { encryptFields, decryptFields } from '../../utils/encryption';
import { consumeOAuthNonce } from './oauth-state.store';

// `generateState`/`validateState` now live in oauth-state.store.ts (their
// natural home alongside the server-side state/nonce tracking that actually
// uses them — see I1). Re-exported here for backward compatibility with
// existing callers (`microsoft.service.ts`, `google.service.ts`, etc.).
export { generateState, validateState } from './oauth-state.store';

/**
 * Fields on stored IdP config JSON that must never be persisted or returned
 * in plaintext. `decryptFields`/`encryptFields` are both idempotent/no-op on
 * legacy plaintext and empty values (see utils/encryption.ts), so reads of
 * pre-existing plaintext rows keep working and get re-encrypted on next save.
 */
const SENSITIVE_CONFIG_FIELDS = ['clientSecret'];

/**
 * Typed error for SSO flow failures, carrying a machine-readable `code`
 * (surfaced to the client for specific UI messaging — state mismatch,
 * domain-not-allowed, provider-disabled, etc.) and the HTTP status the
 * controller should respond with.
 */
export class OAuthFlowError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number = 400) {
    super(message);
    this.name = 'OAuthFlowError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// I4: config-save validation beyond "is it non-empty". Every provider's
// save endpoint previously only checked required fields were present, so a
// malformed redirect URI, a Cognito User Pool ID that isn't even shaped
// like one, or a Hosted UI domain that includes a scheme (breaking the
// `https://${domain}/...` URL-building in cognito.service.ts) were all
// silently accepted and only surfaced as a confusing failure at login time.
// ---------------------------------------------------------------------------

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/** True for a well-formed absolute http(s) URL. */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** AWS Cognito User Pool IDs look like `<region>_<alphanumeric>` (e.g. `us-east-1_AbCdEfGhI`). */
export function isValidCognitoUserPoolId(value: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d_[0-9A-Za-z]+$/.test(value);
}

/** AWS region codes look like `us-east-1`, `eu-west-2`, etc. */
export function isValidAwsRegion(value: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d$/.test(value);
}

/** A Hosted UI / custom domain is a bare host (no scheme, no path) — it's interpolated into `https://${domain}/...`. */
export function isValidBareDomain(value: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(value);
}

export function validateGoogleConfig(data: { redirectUri?: string }): ConfigValidationResult {
  const errors: string[] = [];
  if (data.redirectUri && !isValidHttpUrl(data.redirectUri)) {
    errors.push('Redirect URI must be a valid http(s) URL.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateMicrosoftConfig(data: { redirectUri?: string; tenantId?: string }): ConfigValidationResult {
  const errors: string[] = [];
  if (data.redirectUri && !isValidHttpUrl(data.redirectUri)) {
    errors.push('Redirect URI must be a valid http(s) URL.');
  }
  // 'common' | 'organizations' | 'consumers', a GUID, or a verified domain are all valid tenant identifiers.
  if (data.tenantId && !/^(common|organizations|consumers)$/.test(data.tenantId) && !isValidBareDomain(data.tenantId) && !/^[0-9a-f-]{36}$/i.test(data.tenantId)) {
    errors.push('Tenant ID must be "common", "organizations", "consumers", a tenant GUID, or a verified domain.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateOidcConfig(data: { issuer?: string; redirectUri?: string }): ConfigValidationResult {
  const errors: string[] = [];
  if (data.issuer && !isValidHttpUrl(data.issuer)) {
    errors.push('Issuer must be a valid http(s) URL (e.g. https://issuer.example.com).');
  }
  if (data.redirectUri && !isValidHttpUrl(data.redirectUri)) {
    errors.push('Redirect URI must be a valid http(s) URL.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCognitoConfig(data: {
  userPoolId?: string;
  userPoolRegion?: string;
  redirectUri?: string;
  logoutUri?: string;
  domain?: string;
}): ConfigValidationResult {
  const errors: string[] = [];
  if (data.userPoolId && !isValidCognitoUserPoolId(data.userPoolId)) {
    errors.push('User Pool ID must be in the form "<region>_<id>" (e.g. us-east-1_AbCdEfGhI).');
  }
  if (data.userPoolRegion && !isValidAwsRegion(data.userPoolRegion)) {
    errors.push('User Pool Region must be a valid AWS region code (e.g. us-east-1).');
  }
  if (data.redirectUri && !isValidHttpUrl(data.redirectUri)) {
    errors.push('Redirect URI must be a valid http(s) URL.');
  }
  if (data.logoutUri && !isValidHttpUrl(data.logoutUri)) {
    errors.push('Logout URI must be a valid http(s) URL.');
  }
  if (data.domain && !isValidBareDomain(data.domain)) {
    errors.push('Hosted UI Domain must be a bare host name, without "https://" or a path (e.g. myapp.auth.us-east-1.amazoncognito.com).');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * I3: resolve a customerId from a login-time hint (a raw domain, or an
 * email address to extract the domain from). Used by every provider's
 * `/auth-url` endpoint so it can serve that tenant's own IdP config (its own
 * clientId/secret, jitMode, etc.) instead of always falling back to the
 * global config — "configure in UI" only "works instantly" if the login
 * flow can actually find a per-tenant config to use. Returns `undefined`
 * (never throws) when the hint is empty or no active, matching tenant is
 * found — callers fall back to the global config exactly as before, so a
 * bad/unrecognized hint never blocks login, it just doesn't get a
 * per-tenant config applied to it. This is tenant *resolution*, not
 * authentication (design decision 9) — it never gates access.
 */
export async function resolveCustomerIdFromHint(hint?: string | null): Promise<string | undefined> {
  if (!hint) return undefined;

  const domain = (hint.includes('@') ? hint.split('@')[1] : hint)?.trim().toLowerCase();
  if (!domain) return undefined;

  try {
    const organization = await prisma.organization.findFirst({
      where: { domain: { equals: domain, mode: 'insensitive' }, isActive: true },
      select: { id: true }
    });

    return organization?.id;
  } catch (error) {
    loggerService.error('Error resolving organization from login hint:', error);
    return undefined;
  }
}

export interface OAuthUserInfo {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  emailVerified?: boolean;
  providerId: string; // Unique ID from the provider (sub claim)
}

export interface OAuthConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  isCustomerSpecific: boolean;
  /** I2: JIT provisioning strategy for first-time SSO logins on this config. */
  jitMode: JitMode;
}

export type JitMode = 'disabled' | 'domain-match' | 'legacy-first-customer';

/**
 * I2: JIT (just-in-time) provisioning + returning-user resolution, shared by
 * every SSO provider (Google/Microsoft via this function, Cognito via its
 * own near-identical call in cognito.service.ts — kept separate there only
 * because Cognito's claim shape differs, not because the logic should).
 *
 * Returning-user lookup fixes the structural dead-end from the old code:
 * every provider stored `email: providerId` (the provider's opaque subject
 * id) instead of the user's real email, so `email` could never be used to
 * find a returning user and was useless for its actual purpose. Lookup now
 * matches EITHER the new `providerAccountId` column OR the real email
 * (covers a user who already has a LOCAL/other-SSO account with that email)
 * OR `email` still equal to the providerId (pre-fix rows — migration
 * `20260710190000_...` backfills `providerAccountId` for all of these, but
 * the extra OR clause is a harmless safety net for any row created between
 * that backfill and this code shipping).
 *
 * JIT provisioning for a genuinely new identity follows the config's
 * `jitMode` (design decision 7):
 *  - 'disabled': never auto-create — reject with a clear, actionable error.
 *  - 'domain-match': map the verified email's domain to a Customer.domain
 *    row and provision under that tenant's default 'User' role. An unknown
 *    domain is rejected (not silently dropped into some other tenant).
 *  - 'legacy-first-customer': the historical (dangerous) behavior — every
 *    first-time SSO user lands in the first active customer. Opt-in only,
 *    for tenants that already relied on it before this fix shipped.
 */
export async function findOrProvisionSsoUser(params: {
  authProvider: string;
  providerId: string;
  email: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
  picture?: string | null;
  jitMode: JitMode;
}) {
  const { authProvider, providerId, email, displayName, firstName, lastName, phoneNumber, picture, jitMode } = params;

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ providerAccountId: providerId }, { email }, { email: providerId }]
    },
    include: { role: true, customer: true, profile: true }
  });

  if (user) {
    // Heal a pre-fix row (found via legacy `email === providerId`, or a
    // freshly-migrated row) so future lookups hit the fast/canonical path.
    // Never touches `email` — a legacy row's email positionally holds the
    // provider id, not the real address, and rewriting it risks colliding
    // with another user's real email; that reconciliation is a deliberate,
    // separate admin/data task, not something to do silently on a login hot path.
    if (!user.providerAccountId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { providerAccountId: providerId },
        include: { role: true, customer: true, profile: true }
      });
    }

    if (picture && user.profile && user.profile.avatarUrl !== picture) {
      await prisma.userProfile.update({ where: { userId: user.id }, data: { avatarUrl: picture } });
    }

    return user;
  }

  if (jitMode === 'disabled') {
    throw new OAuthFlowError(
      'jit_disabled',
      'Your account has not been provisioned for single sign-on. Contact your administrator.',
      403
    );
  }

  let targetOrganization: { id: string } | null;

  if (jitMode === 'domain-match') {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      throw new OAuthFlowError('jit_domain_not_allowed', 'Could not determine your email domain.', 400);
    }

    targetOrganization = await prisma.organization.findFirst({
      where: { domain: { equals: domain, mode: 'insensitive' } }
    });

    if (!targetOrganization) {
      throw new OAuthFlowError(
        'jit_domain_not_allowed',
        `No organization is configured for the domain "${domain}". Contact your administrator.`,
        403
      );
    }
  } else {
    // legacy-first-customer
    targetOrganization = await prisma.organization.findFirst({ where: { isActive: true } });
    if (!targetOrganization) {
      throw new OAuthFlowError('jit_no_tenant', 'No active organization is available to provision your account under.', 500);
    }
  }

  const defaultRole = await prisma.role.findFirst({ where: { name: 'User', customerId: targetOrganization.id } });
  if (!defaultRole) {
    throw new OAuthFlowError(
      'jit_no_default_role',
      "Your organization's default 'User' role is missing. Contact your administrator.",
      500
    );
  }

  user = await prisma.user.create({
    data: {
      email,
      providerAccountId: providerId,
      name: displayName || `${firstName || ''} ${lastName || ''}`.trim() || `${authProvider} User ${providerId.substring(0, 8)}`,
      firstName: firstName || null,
      lastName: lastName || null,
      phoneNumber: phoneNumber || null,
      authProvider,
      customerId: targetOrganization.id,
      roleId: defaultRole.id,
      profile: { create: { avatarUrl: picture || null } }
    },
    include: { role: true, customer: true, profile: true }
  });

  loggerService.info(`JIT-provisioned new ${authProvider} user ${user.id} under organization ${targetOrganization.id} (jitMode=${jitMode})`);

  return user;
}

/**
 * Exchange OAuth tokens for application JWT tokens
 * This creates or retrieves a user and generates JWT tokens
 *
 * `nonce`, when provided, must be a value this server itself issued at
 * `/auth-url` time and handed back through `/handle-callback` (see
 * oauth-state.store.ts). This closes a token-substitution gap: the
 * token-exchange endpoints are public and only verify the ID token's
 * signature, which proves who signed it, not that it resulted from a login
 * flow this server actually brokered. A missing/invalid/replayed nonce is
 * rejected before any user lookup happens.
 */
export async function exchangeTokensForJWT(
  userInfo: OAuthUserInfo,
  authProvider: string,
  nonce?: string,
  jitMode: JitMode = 'legacy-first-customer'
): Promise<{
  token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: any;
}> {
  try {
    const { email, name, firstName, lastName, picture, providerId } = userInfo;

    if (!email || !providerId) {
      throw new Error('Email and provider ID are required');
    }

    if (nonce) {
      const nonceRecord = await consumeOAuthNonce(nonce, authProvider);
      if (!nonceRecord) {
        throw new OAuthFlowError(
          'invalid_nonce',
          'This sign-in link has expired or was already used. Please sign in again.',
          400
        );
      }
    }

    const user = await findOrProvisionSsoUser({
      authProvider,
      providerId,
      email,
      displayName: name,
      firstName,
      lastName,
      picture,
      jitMode
    });

    // I1 gate parity: LOCAL login (auth.service.ts) rejects both a
    // deactivated user account and a suspended/inactive organization — SSO
    // must enforce the exact same two checks, which it previously skipped
    // entirely (only `customer.isActive` was checked, and a deactivated
    // *user* could still mint a session via SSO).
    if (!user.isActive) {
      throw new OAuthFlowError('user_inactive', 'Your account has been deactivated. Contact your administrator.', 403);
    }

    if (!user.customer.isActive) {
      throw new OAuthFlowError(
        'tenant_suspended',
        "Your organization's account is not active. Contact your administrator.",
        403
      );
    }

    // Design decision 8: local TOTP 2FA applies to LOCAL logins only — the
    // IdP is responsible for MFA on SSO sessions (Google/Microsoft/Cognito
    // each support their own MFA policies upstream of the token this
    // function receives). SSO exchanges therefore mint tokens directly here,
    // with no 2FA challenge step, unlike authService.login's LOCAL path.
    const tokens = generateJWTTokens(user.id, user.email, user.customerId, user.roleId);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phoneNumber: user.phoneNumber || '',
        role: user.role.name,
        customerId: user.customerId,
        authProvider
      }
    };
  } catch (error) {
    loggerService.error(`Error exchanging ${authProvider} tokens:`, error);
    throw error;
  }
}

/**
 * Generate JWT access and refresh tokens
 */
export function generateJWTTokens(
  userId: string,
  email: string,
  customerId: string,
  roleId: string
): {
  token: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
} {
  // Generate access token
  const access_token = sign(
    {
      userId,
      customerId,
      roleId
    },
    config.jwt.secret as string,
    { expiresIn: config.jwt.accessTokenExpiry } as SignOptions
  );

  // Generate refresh token
  const refresh_token = sign(
    {
      userId,
      email,
      sessionId: randomBytes(16).toString('hex')
    },
    config.jwt.refreshSecret as string,
    { expiresIn: config.jwt.refreshTokenExpiry } as SignOptions
  );

  // Calculate expiry times in seconds
  const accessExpiry = parseExpiry(config.jwt.accessTokenExpiry);
  const refreshExpiry = parseExpiry(config.jwt.refreshTokenExpiry);

  return {
    token: access_token, // For backward compatibility
    access_token,
    refresh_token,
    token_type: 'Bearer',
    expires_in: accessExpiry,
    refresh_expires_in: refreshExpiry
  };
}

/**
 * Parse expiry string to seconds
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // Default 15 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 900;
  }
}

/** Parse a stored config JSON blob and decrypt its sensitive fields (idempotent on legacy plaintext). */
function parseAndDecryptConfig(raw: unknown): Record<string, unknown> {
  const parsed = raw ? JSON.parse(raw as string) : {};
  return decryptFields(parsed, SENSITIVE_CONFIG_FIELDS);
}

/**
 * Get OAuth configuration from database or environment variables
 * Follows the same pattern as Cognito: customer-specific → global → environment
 */
export async function getOAuthConfig(
  providerType: string,
  customerId?: string
): Promise<OAuthConfig | null> {
  try {
    // If customerId is provided, try to get customer-specific configuration
    if (customerId) {
      const customerConfig = await prisma.customerIdentityProvider.findFirst({
        where: {
          customerId,
          type: providerType
        }
      });

      // If customer has specific configuration, return it
      if (customerConfig && customerConfig.enabled) {
        const configData = parseAndDecryptConfig(customerConfig.config);

        return {
          enabled: customerConfig.enabled,
          clientId: (configData.clientId as string) || '',
          clientSecret: (configData.clientSecret as string) || '',
          redirectUri: (configData.redirectUri as string) || '',
          scope: (configData.scope as string) || '',
          isCustomerSpecific: true,
          jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer')
        };
      }
    }

    // If no customer-specific config or it's disabled, try to get global configuration
    const globalConfig = await prisma.identityProvider.findFirst({
      where: { type: providerType }
    });

    // If global config exists in database, use it
    if (globalConfig && globalConfig.enabled) {
      const configData = parseAndDecryptConfig(globalConfig.config);

      return {
        enabled: globalConfig.enabled,
        clientId: (configData.clientId as string) || '',
        clientSecret: (configData.clientSecret as string) || '',
        redirectUri: (configData.redirectUri as string) || '',
        scope: (configData.scope as string) || '',
        isCustomerSpecific: false,
        jitMode: ((configData.jitMode as JitMode) || 'legacy-first-customer')
      };
    }

    return null;
  } catch (error) {
    loggerService.error(`Error getting ${providerType} config:`, error);
    return null;
  }
}

/**
 * Save OAuth configuration to database. `clientSecret` is encrypted at rest
 * (I1 — was previously stored plaintext). `jitMode` defaults to
 * 'domain-match' for a brand-new config (design decision 7); an update that
 * doesn't specify `jitMode` preserves whatever the existing config already
 * had, so saving other fields never silently changes JIT behavior.
 */
export async function saveOAuthConfig(
  providerType: string,
  providerName: string,
  data: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
    jitMode?: JitMode;
  },
  customerId?: string
): Promise<boolean> {
  try {
    // If customerId is provided, save as customer-specific configuration
    if (customerId) {
      const existingConfig = await prisma.customerIdentityProvider.findFirst({
        where: {
          customerId,
          type: providerType
        }
      });

      const previousJitMode = existingConfig
        ? ((JSON.parse((existingConfig.config as string) || '{}').jitMode as JitMode) || 'legacy-first-customer')
        : undefined;

      const configData = encryptFields(
        {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scope: data.scope,
          jitMode: data.jitMode || previousJitMode || 'domain-match'
        },
        SENSITIVE_CONFIG_FIELDS
      );

      if (existingConfig) {
        // Update existing customer-specific config
        await prisma.customerIdentityProvider.update({
          where: { id: existingConfig.id },
          data: {
            enabled: data.enabled,
            config: JSON.stringify(configData)
          }
        });
      } else {
        // Create new customer-specific config
        await prisma.customerIdentityProvider.create({
          data: {
            customerId,
            name: providerName,
            type: providerType,
            enabled: data.enabled,
            config: JSON.stringify(configData)
          }
        });
      }
    } else {
      // Save as global configuration
      const existingConfig = await prisma.identityProvider.findFirst({
        where: { type: providerType }
      });

      const previousJitMode = existingConfig
        ? ((JSON.parse((existingConfig.config as string) || '{}').jitMode as JitMode) || 'legacy-first-customer')
        : undefined;

      const configData = encryptFields(
        {
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scope: data.scope,
          jitMode: data.jitMode || previousJitMode || 'domain-match'
        },
        SENSITIVE_CONFIG_FIELDS
      );

      if (existingConfig) {
        // Update existing global config
        await prisma.identityProvider.update({
          where: { id: existingConfig.id },
          data: {
            enabled: data.enabled,
            config: JSON.stringify(configData)
          }
        });
      } else {
        // Create new global config
        await prisma.identityProvider.create({
          data: {
            name: providerName,
            type: providerType,
            enabled: data.enabled,
            config: JSON.stringify(configData)
          }
        });
      }
    }

    return true;
  } catch (error) {
    loggerService.error(`Error saving ${providerType} config:`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// URGENT security fix (2026-07-11): GET /google, /microsoft, /cognito used to
// return `clientSecret` (and, for Cognito, `awsSecretAccessKey`) in plaintext
// to ANY caller, including unauthenticated ones. Controllers now redact the
// value before sending and preserve-on-omit on save, using these helpers.
// ---------------------------------------------------------------------------

/**
 * Turn a real secret value into a response-safe shape: never the plaintext,
 * only a presence boolean the settings UI uses to render "•••• configured"
 * with a "Replace secret" affordance.
 */
export function redactSecret(value: string | undefined | null): { value: string; present: boolean } {
  return { value: '', present: Boolean(value) };
}

/**
 * Preserve-on-omit: the settings UI never resends a previously-saved secret
 * verbatim (it only ever sees the redacted value above), so an empty/omitted
 * secret on save must NOT wipe the one already stored. Returns `incoming`
 * when it's a real (non-empty) value, else `existing`.
 */
export function preserveSecretOnOmit(
  incoming: string | undefined | null,
  existing: string | undefined | null
): string | undefined {
  return incoming && incoming.trim() !== '' ? incoming : existing ?? undefined;
}

/**
 * Read the previously-stored clientSecret for the EXACT save target (the
 * customer-specific row when `customerId` is given, else the global row) —
 * deliberately NOT the fallback chain `getOAuthConfig` uses for login, so a
 * preserve-on-omit save never cross-contaminates a brand-new
 * customer-specific override with the global secret (or vice versa).
 */
export async function getStoredClientSecret(providerType: string, customerId?: string): Promise<string | undefined> {
  try {
    const row = customerId
      ? await prisma.customerIdentityProvider.findFirst({ where: { customerId, type: providerType } })
      : await prisma.identityProvider.findFirst({ where: { type: providerType } });

    if (!row?.config) return undefined;
    const decoded = parseAndDecryptConfig(row.config as string);
    return (decoded.clientSecret as string) || undefined;
  } catch (error) {
    loggerService.error(`Error reading stored ${providerType} client secret:`, error);
    return undefined;
  }
}

/**
 * Reset customer-specific configuration to use global configuration
 */
export async function resetOAuthConfig(providerType: string, customerId: string): Promise<boolean> {
  try {
    // Delete customer-specific configuration
    await prisma.customerIdentityProvider.deleteMany({
      where: {
        customerId,
        type: providerType
      }
    });

    return true;
  } catch (error) {
    loggerService.error(`Error resetting ${providerType} configuration:`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// I4: test-connection support.
//
// There is no unauthenticated way to fully validate an OAuth2/OIDC client
// (client_id/client_secret) without a real user completing a login and
// handing back an authorization code — we don't have one at config-save
// time. `probeOAuthClientCredentials` uses the standard, well-known
// technique for a best-effort check anyway: POST a bogus authorization_code
// grant to the provider's token endpoint. A client_id/secret pair that is
// simply *wrong* is rejected immediately with `invalid_client` /
// `unauthorized_client`, before the provider even looks at the code. A
// *valid* client instead gets `invalid_grant` (or similar) — the code is
// what's rejected, not the client. That difference is enough to tell a
// typo'd secret from a working one without needing a real login flow.
// ---------------------------------------------------------------------------

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: string[];
}

export interface OAuthCredentialProbeResult {
  /** False when the token endpoint itself could not be reached at all (network/DNS/timeout). */
  reachable: boolean;
  /** Only meaningful when `reachable` is true. */
  credentialsAccepted: boolean;
  providerErrorCode?: string;
  errorMessage?: string;
}

const CREDENTIAL_REJECTION_ERROR_CODES = ['invalid_client', 'unauthorized_client'];

export async function probeOAuthClientCredentials(
  tokenEndpoint: string,
  body: Record<string, string>
): Promise<OAuthCredentialProbeResult> {
  try {
    const response = await axios.post(tokenEndpoint, new URLSearchParams(body).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true, // we want the provider's error body, not an axios throw
      timeout: 8000
    });

    const providerErrorCode = response.data?.error as string | undefined;

    if (!providerErrorCode) {
      // A fake code returning 200 is very unusual, but nothing here
      // indicated the client itself was rejected.
      return { reachable: true, credentialsAccepted: true };
    }

    return {
      reachable: true,
      credentialsAccepted: !CREDENTIAL_REJECTION_ERROR_CODES.includes(providerErrorCode),
      providerErrorCode,
      errorMessage: response.data?.error_description || providerErrorCode
    };
  } catch (error) {
    return {
      reachable: false,
      credentialsAccepted: false,
      errorMessage: error instanceof Error ? error.message : 'Network error contacting the provider'
    };
  }
}

/** Lightweight reachability check for an OIDC discovery document. Returns the parsed document, or null on failure. */
export async function fetchOidcDiscoveryDocument(discoveryUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await axios.get(discoveryUrl, { timeout: 8000 });
    return response.data;
  } catch (error) {
    loggerService.warn(`OIDC discovery fetch failed for ${discoveryUrl}:`, error);
    return null;
  }
}

/**
 * Handle standardized OAuth errors
 */
export function handleOAuthError(error: any): { message: string; code: string } {
  if (error.response) {
    // OAuth provider returned an error response
    return {
      message: error.response.data?.error_description || error.response.data?.error || 'OAuth provider error',
      code: error.response.data?.error || 'oauth_error'
    };
  } else if (error.message) {
    return {
      message: error.message,
      code: 'oauth_error'
    };
  } else {
    return {
      message: 'Unknown OAuth error',
      code: 'unknown_error'
    };
  }
}

/**
 * I4: map an SSO flow error to a specific HTTP status + machine-readable
 * `code`, so LoginPage/OAuthCallbackPage can render a specific message
 * (state mismatch, domain not allowed, provider disabled, tenant suspended,
 * ...) instead of a generic "authentication failed". Every provider
 * controller's handle-callback/token-exchange handlers should route caught
 * errors through this — see google/microsoft/cognito .controller.ts.
 */
export function toOAuthErrorResponse(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof OAuthFlowError) {
    return { status: error.statusCode, body: { error: error.message, code: error.code } };
  }

  const { message, code } = handleOAuthError(error);
  return { status: 500, body: { error: message, code } };
}

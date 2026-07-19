// Auth types and interfaces

import type { PermissionSnapshot } from '../../lib/permissions';

// Login request type
export interface LoginRequestType {
  email: string;
  password: string;
}

// Register request type
export interface RegisterRequestType {
  email: string;
  name: string;
  password: string;
  customerId: string;
  roleId?: string;
  authProvider?: string; // LOCAL, COGNITO, SAML, OAUTH, etc.
}

// Change password request type
export interface ChangePasswordRequestType {
  currentPassword: string;
  newPassword: string;
}

// Check user request type
export interface CheckUserRequestType {
  email: string;
}

// Refresh token request type
export interface RefreshTokenRequestType {
  refresh_token: string;
}

// User response type
export interface UserResponseType {
  id: string;
  email: string;
  name: string;
  role: string;
  customerId: string;
  authProvider?: string; // LOCAL, COGNITO, SAML, OAUTH, etc.
}

// Login response type
export interface LoginResponseType {
  user: UserResponseType;
  token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  /**
   * The logged-in user's resolved permission snapshot (design decision 5,
   * _ai_tasks/rbac-idp-hardening/2026-07-10/01_plan.md): the client mirrors
   * server matching logic against this instead of trusting a role name.
   * Required so every LoginResponseType construction site is forced to
   * populate it — mirrors GET /api/me/permissions.
   */
  permissions: PermissionSnapshot;
}

/**
 * Returned by POST /auth/login INSTEAD of tokens when the user has TOTP 2FA
 * enabled: the client must POST /auth/2fa/login with { challengeToken, code }
 * within 5 minutes to obtain the full token pair.
 */
export interface TwoFactorChallengeResponseType {
  requires2fa: true;
  challengeToken: string;
}

/** Union result of the credential step of login. */
export type LoginResultType = LoginResponseType | TwoFactorChallengeResponseType;

/** Type guard: does this login result require the TOTP step? */
export function isTwoFactorChallenge(
  result: LoginResultType
): result is TwoFactorChallengeResponseType {
  return (result as TwoFactorChallengeResponseType).requires2fa === true;
}

// Refresh token response type
export interface RefreshTokenResponseType {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// JWT payload type
export interface JwtPayloadType {
  userId: string;
  customerId: string;
  roleId: string;
  /**
   * Present (and `true`) only on short-lived impersonation tokens (see
   * `authService.generateImpersonationToken`). Normal auth paths ignore
   * these claims entirely and treat the token as the target user. This
   * build has no admin route that issues impersonation tokens — the JWT
   * plumbing is kept so a future admin surface can use it without a token
   * format change.
   */
  impersonation?: boolean;
  /** User id of the admin who requested the impersonation token. */
  impersonatorUserId?: string;
}

// Refresh token payload type
export interface RefreshTokenPayloadType {
  userId: string;
  email: string;
  sessionId: string;
}

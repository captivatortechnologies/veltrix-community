// Cognito schema types
import type { JitMode } from '../oauth/oauth.utils';

export interface CognitoTokenExchangeRequest {
  idToken: string;
  accessToken: string;
  /** I1: the nonce handed back by POST /cognito/handle-callback — validated + consumed server-side. */
  nonce?: string;
}

export interface CognitoCallbackRequest {
  code: string;
  redirectUri: string;
  /** I1: the state issued by GET /cognito/auth-url — validated server-side. */
  state: string;
}

export interface CognitoAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface CognitoConfigResponse {
  enabled: boolean;
  userPoolId: string;
  userPoolRegion: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  logoutUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  /** I2: JIT provisioning strategy for first-time SSO logins on this config. */
  jitMode?: JitMode;
  /**
   * I3: Cognito Hosted UI domain (e.g. `myapp.auth.us-east-1.amazoncognito.com`).
   * Distinct from `userPoolId` — Cognito's hosted sign-in pages live under a
   * separately-chosen domain prefix, not the pool ID. Required for the
   * authorize/token endpoints to be built correctly for THIS tenant's pool
   * instead of relying on a hardcoded default.
   */
  domain?: string;
  /**
   * I5: AWS credentials for Cognito *admin* API calls (AdminCreateUser,
   * ListUsers, AdminDeleteUser — NOT needed for the login/token-exchange
   * flow itself, which verifies ID tokens against the pool's public JWKS).
   * Configurable via the UI so admin operations don't require restarting
   * the server to pick up COGNITO_AWS_ACCESS_KEY_ID/SECRET env vars —
   * see cognitoService.resolveAwsCredentials, which falls back to those
   * env vars when neither is set here.
   */
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
}

// Define a type for the database user
export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
  roleId: string;
  customerId: string;
  authProvider: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CognitoCreateUserResponse {
  success: boolean;
  cognitoUserId?: string;
  error?: string;
  dbUser?: DbUser; // Database user object if created successfully
  dbSaveSuccess?: boolean; // Flag indicating if the database save was successful
}

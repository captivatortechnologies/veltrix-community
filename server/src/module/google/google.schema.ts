import type { JitMode } from '../oauth/oauth.utils';

export interface GoogleConfigResponse {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  /** I2: JIT provisioning strategy for first-time SSO logins on this config. */
  jitMode?: JitMode;
}

export interface GoogleCallbackRequest {
  code: string;
  redirectUri: string;
  /** I1: the state issued by GET /google/auth-url — validated server-side. */
  state: string;
}

export interface GoogleTokenExchangeRequest {
  idToken: string;
  accessToken: string;
  /** I1: the nonce handed back by POST /google/handle-callback — validated + consumed server-side. */
  nonce?: string;
}

export interface GoogleAuthUrlResponse {
  authUrl: string;
  state: string;
}

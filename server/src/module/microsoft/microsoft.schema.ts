import type { JitMode } from '../oauth/oauth.utils';

export interface MicrosoftConfigResponse {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  scope: string;
  authority?: string;
  isCustomerSpecific?: boolean;
  /** I2: JIT provisioning strategy for first-time SSO logins on this config. */
  jitMode?: JitMode;
}

export interface MicrosoftCallbackRequest {
  code: string;
  redirectUri: string;
  /** I1: the state issued by GET /microsoft/auth-url — validated server-side. */
  state: string;
}

export interface MicrosoftTokenExchangeRequest {
  idToken: string;
  accessToken: string;
  /** I1: the nonce handed back by POST /microsoft/handle-callback — validated + consumed server-side. */
  nonce?: string;
}

export interface MicrosoftAuthUrlResponse {
  authUrl: string;
  state: string;
}

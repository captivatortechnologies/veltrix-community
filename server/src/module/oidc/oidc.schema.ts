// Generic OIDC provider schema types. Mirrors google.schema.ts's shape, plus
// `issuer` — the field the shared `OAuthConfig` interface (oauth.utils.ts)
// doesn't carry, which is why this provider (like Cognito) keeps its own
// config get/save logic in oidc.service.ts rather than using
// getOAuthConfig/saveOAuthConfig directly.
import type { JitMode } from '../oauth/oauth.utils';

export interface OidcConfigResponse {
  enabled: boolean;
  /** OIDC issuer base URL — discovery is fetched from `{issuer}/.well-known/openid-configuration`. */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
  isCustomerSpecific?: boolean;
  /** I2: JIT provisioning strategy for first-time SSO logins on this config. */
  jitMode?: JitMode;
}

export interface OidcCallbackRequest {
  code: string;
  redirectUri: string;
  /** The state issued by GET /oidc/auth-url — validated server-side. */
  state: string;
}

export interface OidcTokenExchangeRequest {
  idToken: string;
  accessToken: string;
  /** The nonce handed back by POST /oidc/handle-callback — validated + consumed server-side. */
  nonce?: string;
}

export interface OidcAuthUrlResponse {
  authUrl: string;
  state: string;
}

// Shared types for the SSO identity provider services (google/microsoft/
// cognito). Kept in one place so google/microsoft/cognito don't each
// maintain their own copy of the same literal unions and response shapes.

/** I2: JIT provisioning strategy for first-time SSO logins on a given config. */
export type JitMode = 'disabled' | 'domain-match' | 'legacy-first-customer';

/** I4: result of POST /{provider}/test-connection. */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: string[];
}

/**
 * I4: map the machine-readable `code` an SSO flow error carries (see
 * OAuthFlowError / toOAuthErrorResponse in oauth.utils.ts) to a specific,
 * actionable message for LoginPage/OAuthCallbackPage — instead of a
 * generic "Authentication failed" for every failure mode. Unknown codes
 * fall back to whatever message the server sent (still better than
 * nothing), or a generic message as a last resort.
 */
export function describeSsoError(code: string | undefined, serverMessage?: string): string {
  switch (code) {
    case 'invalid_state':
      return 'Your sign-in session could not be verified (it may have expired, or you may have gone back in your browser). Please try signing in again.';
    case 'nonce_mismatch':
    case 'invalid_nonce':
      return 'Your sign-in link has expired or was already used. Please try signing in again.';
    case 'provider_disabled':
      return 'This sign-in method is not currently enabled. Contact your administrator or use a different sign-in method.';
    case 'provider_misconfigured':
      return serverMessage || 'This sign-in method is not fully configured yet. Contact your administrator.';
    case 'invalid_token':
      return 'Your sign-in could not be verified. Please try again.';
    case 'user_inactive':
      return 'Your account has been deactivated. Contact your administrator.';
    case 'tenant_suspended':
      return "Your organization's account is not active. Contact your administrator.";
    case 'jit_disabled':
      return 'Your account has not been provisioned for single sign-on. Contact your administrator to create an account.';
    case 'jit_domain_not_allowed':
      return serverMessage || 'No organization is configured for your email domain. Contact your administrator.';
    case 'jit_no_default_role':
    case 'jit_no_tenant':
      return "Your organization's sign-on configuration is incomplete. Contact your administrator.";
    case 'missing_params':
      return 'Your sign-in request was incomplete. Please try again.';
    default:
      return serverMessage || 'Authentication failed. Please try again.';
  }
}

/** Best-effort extraction of {error, code} from an axios error response. */
export function extractSsoErrorFromAxiosError(error: unknown): string {
  const response = (error as { response?: { data?: { error?: string; code?: string } } })?.response;
  if (response?.data) {
    return describeSsoError(response.data.code, response.data.error);
  }
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
}

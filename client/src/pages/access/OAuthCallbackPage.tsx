import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { googleService } from '../../services/googleService';
import { microsoftService } from '../../services/microsoftService';
import { oidcService } from '../../services/oidcService';
import { handleCognitoCallback, exchangeCognitoTokens, COGNITO_STATE_KEY } from '../../services/cognitoService';
import { setAuthData, getRememberMePreference } from '../../services/authService';
import { extractSsoErrorFromAxiosError } from '../../services/identityProviderTypes';
import logoSvg from '../../assets/logo.svg';
import { useBrand } from '../../brand';

const OAuthCallbackPage: React.FC = () => {
  const brand = useBrand();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Processing authentication...');
  // Guards this effect against running twice for the same `code`/`state`.
  // Every leg of this flow is one-time-use server-side (state, then nonce —
  // see oauth-state.store.ts), so a second invocation doesn't just waste a
  // request, it actively fails (a replayed/already-consumed state or nonce)
  // and can surface a confusing error even though the FIRST invocation
  // already succeeded. React 18 StrictMode intentionally double-invokes
  // effects in development to catch exactly this class of bug; without this
  // guard it's directly observable end-to-end (confirmed while building the
  // generic OIDC provider's E2E coverage — a real browser redirect here
  // fired /handle-callback and /token-exchange twice, and the second
  // token-exchange failed with `nonce_mismatch`/a token missing the custom
  // claims the one-time mock-issuer hook had already been consumed by the
  // first). Not React-StrictMode-specific either — a slow network plus an
  // impatient double-click, or a browser back/forward replaying this exact
  // URL, hits the same one-time-use guards for the same underlying reason.
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const handleOAuthCallback = async () => {
      try {
        // Get the authorization code and state from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Check for OAuth errors
        if (error) {
          setError(errorDescription || error);
          setStatus('Authentication failed');
          return;
        }

        if (!code) {
          setError('No authorization code received');
          setStatus('Authentication failed');
          return;
        }

        if (!state) {
          setError('No sign-in state received. Please try signing in again.');
          setStatus('Authentication failed');
          return;
        }

        // Determine which OAuth provider based on stored state
        const googleState = sessionStorage.getItem('google_oauth_state');
        const microsoftState = sessionStorage.getItem('microsoft_oauth_state');
        const oidcState = sessionStorage.getItem('oidc_oauth_state');
        const cognitoState = sessionStorage.getItem(COGNITO_STATE_KEY);

        const redirectUri = window.location.origin + '/oauth/callback';

        let tokens;
        let loginResponse;

        if (state === googleState) {
          // Google OAuth callback
          setStatus('Authenticating with Google...');

          // Handle Google callback - exchange code for tokens. The server
          // validates `state` (I1) and returns the bound `nonce`.
          tokens = await googleService.handleCallback(code, redirectUri, state);

          // Exchange Google tokens for app JWT — `nonce` is consumed
          // server-side (one-time) and checked against the ID token's own
          // nonce claim.
          loginResponse = await googleService.exchangeTokens(tokens.idToken, tokens.accessToken, tokens.nonce);

          // Clear Google state
          sessionStorage.removeItem('google_oauth_state');

        } else if (state === microsoftState) {
          // Microsoft OAuth callback
          setStatus('Authenticating with Microsoft...');

          // Handle Microsoft callback - exchange code for tokens
          tokens = await microsoftService.handleCallback(code, redirectUri, state);

          // Exchange Microsoft tokens for app JWT
          loginResponse = await microsoftService.exchangeTokens(tokens.idToken, tokens.accessToken, tokens.nonce);

          // Clear Microsoft state
          sessionStorage.removeItem('microsoft_oauth_state');

        } else if (state === oidcState) {
          // Generic OIDC callback
          setStatus('Authenticating...');

          // Handle the OIDC callback - exchange code for tokens. The server
          // validates `state` and returns the bound `nonce`.
          tokens = await oidcService.handleCallback(code, redirectUri, state);

          // Exchange OIDC tokens for app JWT — `nonce` is consumed
          // server-side (one-time) and checked against the ID token's own
          // nonce claim.
          loginResponse = await oidcService.exchangeTokens(tokens.idToken, tokens.accessToken, tokens.nonce);

          // Clear OIDC state
          sessionStorage.removeItem('oidc_oauth_state');

        } else if (state === cognitoState) {
          // AWS Cognito Hosted UI callback
          setStatus('Authenticating with Cognito...');

          // Exchange the code for Cognito tokens (server validates `state` and
          // returns the bound `nonce`), then swap those for an app JWT — the
          // server JWKS-verifies the ID token, consumes the nonce (one-time),
          // and JIT-provisions the local user.
          tokens = await handleCognitoCallback(code, redirectUri, state);
          loginResponse = await exchangeCognitoTokens(tokens.idToken, tokens.accessToken, tokens.nonce);

          // Clear Cognito state
          sessionStorage.removeItem(COGNITO_STATE_KEY);

        } else {
          setError('Your sign-in session could not be verified (state mismatch). Please try signing in again.');
          setStatus('Authentication failed');
          return;
        }

        // Store the JWT token and user info
        if (loginResponse) {
          // Get rememberMe preference that was stored before OAuth redirect
          const rememberMe = getRememberMePreference();

          // Store token and user info in appropriate storage based on rememberMe
          setAuthData(loginResponse.token, loginResponse.user, rememberMe);

          console.log('OAuth login successful, token stored:', loginResponse.token);
          console.log('User stored:', loginResponse.user);
          console.log('Remember me:', rememberMe);

          setStatus('Authentication successful! Redirecting...');

          // Redirect to home page
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        } else {
          setError('Failed to complete authentication');
          setStatus('Authentication failed');
        }

      } catch (err) {
        console.error('OAuth callback error:', err);
        // I4: surface a specific, actionable message (state mismatch, nonce
        // expired, tenant suspended, domain not allowed, ...) instead of a
        // generic failure, using the machine-readable `code` the server
        // sends (see OAuthFlowError / toOAuthErrorResponse).
        setError(extractSsoErrorFromAxiosError(err));
        setStatus('Authentication failed');
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
        <div className="text-center">
          <img src={logoSvg} alt={`${brand.name} logo`} className="h-10 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {status}
          </h1>

          {!error && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded mt-4">
              <div className="font-medium mb-1">Authentication Error</div>
              <p className="text-sm">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                ← Back to login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OAuthCallbackPage;

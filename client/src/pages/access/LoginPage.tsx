import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff, LogIn, AlertTriangle, ArrowRight } from 'lucide-react';
import { login, checkUserExists, setAuthData } from '../../services/authService';
import { loginWith2fa, type TwoFactorLoginResponse } from '../../services/twoFactorService';
import { getCognitoConfig } from '../../services/cognitoService';
import { oidcService } from '../../services/oidcService';
import CognitoLoginButton from '../../components/auth/CognitoLoginButton';
import GoogleLoginButton from '../../components/auth/GoogleLoginButton';
import MicrosoftLoginButton from '../../components/auth/MicrosoftLoginButton';
import OidcLoginButton from '../../components/auth/OidcLoginButton';
import logoSvg from '../../assets/logo.svg';
import { useBrand } from '../../brand';

enum LoginStep {
  EMAIL,
  PASSWORD,
  TWO_FACTOR,
  COGNITO_REDIRECT,
  GOOGLE_REDIRECT,
  MICROSOFT_REDIRECT,
  OIDC_REDIRECT
}

const LoginPage: React.FC = () => {
  const brand = useBrand();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isCognitoEnabled, setIsCognitoEnabled] = useState(false);
  // Generic OIDC — unlike Cognito/Google/Microsoft, its sign-in button is
  // rendered immediately on the EMAIL step (not gated behind checkUserExists
  // finding an existing account first). A first-time SSO user provisioned
  // via JIT has, by definition, no User row yet — checkUserExists always
  // returns exists:false for them, so a redirect step reachable only AFTER
  // that check can never be reached by the exact users JIT exists to serve.
  const [isOidcEnabled, setIsOidcEnabled] = useState(false);
  const [currentStep, setCurrentStep] = useState<LoginStep>(LoginStep.EMAIL);
  const [rememberMe, setRememberMe] = useState(false);
  // TOTP 2FA step state (set when POST /auth/login returns requires2fa)
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  // Track the auth provider for debugging purposes
  const [, setUserAuthProvider] = useState<string | undefined | null>(null);
  
  const location = useLocation();

  // Fetch Cognito configuration
  useEffect(() => {
    const fetchCognitoConfig = async () => {
      try {
        const config = await getCognitoConfig();
        // Only surface the Cognito button when it's actually usable: enabled AND
        // a real pool is configured. `enabled` defaults to true even with an
        // empty userPoolId/clientId, which would show a button that errors on
        // click (getAuthUrl throws provider_misconfigured).
        setIsCognitoEnabled(!!(config?.enabled && config.userPoolId && config.clientId));
      } catch (error) {
        console.error('Error fetching Cognito configuration:', error);
      }
    };
    
    fetchCognitoConfig();
  }, []);

  // Fetch generic OIDC configuration — drives whether the persistent
  // "Continue with SSO" button renders on the EMAIL step. Re-checked
  // (debounced) as `email` changes and forwarded as an emailHint: a
  // CUSTOMER-SPECIFIC-only config (no platform-wide global override) is
  // invisible to an anonymous caller with no hint at all, so the button
  // would otherwise never appear for a tenant that scoped OIDC to just
  // their own organization — see oidcService.getConfig's doc comment.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const config = await oidcService.getConfig(email || undefined);
        if (!cancelled) setIsOidcEnabled(Boolean(config?.enabled));
      } catch (error) {
        console.error('Error fetching OIDC configuration:', error);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email]);

  useEffect(() => {
    // Check if the URL has an expired parameter
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('expired') === 'true') {
      setSessionExpired(true);
    }
  }, [location]);
  
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    try {
      // Check if user exists
      const result = await checkUserExists(email);
      
      if (result.exists) {
        // User exists, determine next step based on auth provider
        setUserAuthProvider(result.authProvider);
        
        if (result.authProvider === 'LOCAL') {
          // Show password field for local users
          setCurrentStep(LoginStep.PASSWORD);
        } else if (result.authProvider === 'COGNITO' && isCognitoEnabled) {
          // Redirect to Cognito login
          setCurrentStep(LoginStep.COGNITO_REDIRECT);
        } else if (result.authProvider === 'GOOGLE') {
          // Redirect to Google login
          setCurrentStep(LoginStep.GOOGLE_REDIRECT);
        } else if (result.authProvider === 'AZURE') {
          // Redirect to Microsoft login
          setCurrentStep(LoginStep.MICROSOFT_REDIRECT);
        } else if (result.authProvider === 'OIDC') {
          // Redirect to the generic OIDC provider
          setCurrentStep(LoginStep.OIDC_REDIRECT);
        } else {
          // Unknown auth provider
          setError(`Authentication method not supported: ${result.authProvider}`);
        }
      } else {
        // User doesn't exist - use a generic error message
        setError('Login failure. Please try again later.');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to check email. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Shared final step for password and 2FA logins: store the session and
  // land on the home page. (The hosted platform-operator portal this used to
  // branch to for `isPlatformAdmin` users doesn't exist in the self-hosted
  // Community Edition — `isPlatformAdmin` is still a valid RBAC concept, it
  // just no longer has a dedicated destination to redirect to.)
  const completeSignIn = (response: TwoFactorLoginResponse) => {
    // Store token and user info in appropriate storage based on rememberMe
    setAuthData(response.token, response.user, rememberMe);
    window.location.href = '/';
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Try local login
      const response = await login(email, password);

      // Check if we need to redirect to Cognito
      if ('redirectToCognito' in response) {
        // User exists in Cognito, redirect to Cognito login
        setCurrentStep(LoginStep.COGNITO_REDIRECT);
        return;
      }

      // TOTP 2FA required: credentials were correct but no tokens are issued
      // yet — collect a one-time code and finish at /auth/2fa/login.
      const maybeChallenge = response as unknown as { requires2fa?: boolean; challengeToken?: string };
      if (maybeChallenge.requires2fa && maybeChallenge.challengeToken) {
        setChallengeToken(maybeChallenge.challengeToken);
        setTwoFactorCode('');
        setCurrentStep(LoginStep.TWO_FACTOR);
        return;
      }

      if (response) {
        completeSignIn(response);
        return;
      }

      // Login failed
      setError('Invalid password. Please try again.');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to login. Please check your credentials.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!challengeToken) {
      setError('Your sign-in session has expired. Please enter your password again.');
      setCurrentStep(LoginStep.PASSWORD);
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginWith2fa(challengeToken, twoFactorCode.trim());
      completeSignIn(response);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error
        ? err.message
        : 'Failed to verify the code. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Render the appropriate step
  const renderCurrentStep = () => {
    switch (currentStep) {
      case LoginStep.EMAIL:
        return (
          <>
          <form className="mt-8 space-y-6" onSubmit={handleEmailSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="absolute right-3 inset-y-0 flex items-center">
                  <ArrowRight size={20} className="h-5 w-5 text-blue-300 group-hover:text-blue-200" />
                </span>
                {isLoading ? 'Checking...' : 'Next'}
              </button>
            </div>
          </form>

          {/*
            Generic OIDC's sign-in button is rendered immediately here,
            independent of the email-first checkUserExists flow above — see
            the isOidcEnabled state doc comment. The typed email (if any) is
            still forwarded as an emailHint so the server can resolve this
            tenant's own config (I3); it's optional, so this also works for a
            user who hasn't typed anything yet.
          */}
          {(isOidcEnabled || isCognitoEnabled) && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">or</span>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {isOidcEnabled && (
                  <OidcLoginButton
                    className="w-full"
                    onError={(err) => setError(err)}
                    rememberMe={rememberMe}
                    email={email}
                  />
                )}
                {/* Cognito's button is rendered here (not only after
                    checkUserExists) so first-time / JIT-provisioned users, who
                    have no local User row yet, can still start the Hosted UI
                    flow. The typed email is forwarded as an emailHint. */}
                {isCognitoEnabled && (
                  <CognitoLoginButton className="w-full" email={email} rememberMe={rememberMe} />
                )}
              </div>
            </div>
          )}
          </>
        );

      case LoginStep.PASSWORD:
        return (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit}>
            <div>
              <div className="flex justify-between items-center">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email address
                </label>
                <button
                  type="button"
                  onClick={() => setCurrentStep(LoginStep.EMAIL)}
                  className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                  Change
                </button>
              </div>
              <div className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">
                {email}
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Remember me
                </label>
              </div>
              
              <div className="text-sm">
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                  Forgot password?
                </a>
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <LogIn size={20} className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
                </span>
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        );
        
      case LoginStep.TWO_FACTOR:
        return (
          <form className="mt-8 space-y-6" onSubmit={handleTwoFactorSubmit}>
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Two-factor authentication is enabled for <strong>{email}</strong>. Enter the
                6-digit code from your authenticator app to finish signing in.
              </p>
            </div>

            <div>
              <label htmlFor="two-factor-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Verification code
              </label>
              <input
                id="two-factor-code"
                name="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="123456"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 tracking-widest"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading || twoFactorCode.trim().length < 6}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <LogIn size={20} className="h-5 w-5 text-blue-500 group-hover:text-blue-400" />
                </span>
                {isLoading ? 'Verifying...' : 'Verify and sign in'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setTwoFactorCode('');
                  setCurrentStep(LoginStep.PASSWORD);
                }}
                className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                ← Back to password
              </button>
            </div>
          </form>
        );

      case LoginStep.COGNITO_REDIRECT:
        return (
          <div className="mt-8 space-y-6">
          <div className="text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your account uses AWS Cognito for authentication.
            </p>
            <CognitoLoginButton className="w-full" email={email} rememberMe={rememberMe} />
            <button
              type="button"
              onClick={() => setCurrentStep(LoginStep.EMAIL)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              ← Back to email
            </button>
          </div>
          </div>
        );

      case LoginStep.GOOGLE_REDIRECT:
        return (
          <div className="mt-8 space-y-6">
          <div className="text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your account uses Google for authentication.
            </p>
            <GoogleLoginButton
              className="w-full"
              onError={(err) => setError(err)}
              rememberMe={rememberMe}
              email={email}
            />
            <button
              type="button"
              onClick={() => setCurrentStep(LoginStep.EMAIL)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              ← Back to email
            </button>
          </div>
          </div>
        );

      case LoginStep.MICROSOFT_REDIRECT:
        return (
          <div className="mt-8 space-y-6">
          <div className="text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your account uses Microsoft for authentication.
            </p>
            <MicrosoftLoginButton
              className="w-full"
              onError={(err) => setError(err)}
              rememberMe={rememberMe}
              email={email}
            />
            <button
              type="button"
              onClick={() => setCurrentStep(LoginStep.EMAIL)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              ← Back to email
            </button>
          </div>
          </div>
        );

      case LoginStep.OIDC_REDIRECT:
        return (
          <div className="mt-8 space-y-6">
          <div className="text-center">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your account uses single sign-on for authentication.
            </p>
            <OidcLoginButton
              className="w-full"
              onError={(err) => setError(err)}
              rememberMe={rememberMe}
              email={email}
            />
            <button
              type="button"
              onClick={() => setCurrentStep(LoginStep.EMAIL)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              ← Back to email
            </button>
          </div>
          </div>
        );

      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
        <div className="text-center">
          <img src={logoSvg} alt={`${brand.name} logo`} className="h-10 w-auto mx-auto mb-1" />
          {brand.vendor && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{brand.vendor}</p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sign in</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Access your {brand.name} account
          </p>
        </div>

        {sessionExpired && (
          <div className="bg-amber-100 dark:bg-amber-900/30 border-l-4 border-amber-500 text-amber-700 dark:text-amber-300 p-4 rounded flex items-start" role="alert">
            <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <p>Your session has expired. Please sign in again to continue.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 rounded" role="alert">
            <div className="font-medium mb-1">Authentication Error</div>
            <p className="text-sm">{error}</p>
          </div>
        )}
        
        {renderCurrentStep()}
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

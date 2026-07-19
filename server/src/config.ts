import { env } from './config/env';

// ============================================================================
// Application configuration — built from the validated `env` (see
// ./config/env.ts). This is the object almost every module in the codebase
// imports as `import { config } from '../config'` (or `'./config'`), so its
// shape (in particular `jwt.*` and the OAuth provider blocks) is a stable
// contract — do not rename fields without updating every consumer.
//
// IMPORTANT: there are no public fallback literals for any secret here.
// `env.JWT_SECRET`, `env.JWT_REFRESH_SECRET`, `env.ENCRYPTION_KEY` and
// `env.COOKIE_SECRET` are guaranteed to be set (non-empty) by the time this
// module finishes evaluating — `./config/env` fails fast (exits the
// process) during its own import if any of them is missing.
// ============================================================================

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  appUrl: env.APP_URL,
  corsOrigin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  logLevel: env.LOG_LEVEL,

  dbUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,

  // Back-compat top-level fields — several modules read `config.jwtSecret`
  // directly rather than `config.jwt.secret`. Keep both in sync.
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  encryptionKey: env.ENCRYPTION_KEY,
  cookieSecret: env.COOKIE_SECRET,

  jwt: {
    secret: env.JWT_SECRET,
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  },

  // Global Cognito configuration — optional plugin, off by default
  // (see config/feature-flags.ts `oauth.cognito`). Never required at
  // startup: cognito.enabled being false means these fields are unused.
  cognito: {
    enabled: process.env.COGNITO_ENABLED === 'true',
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    userPoolRegion: process.env.COGNITO_USER_POOL_REGION || 'us-east-1',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    clientSecret: process.env.COGNITO_CLIENT_SECRET || '',
    redirectUri: process.env.COGNITO_REDIRECT_URI || 'http://localhost:8730/oauth/callback',
    logoutUri: process.env.COGNITO_LOGOUT_URI || 'http://localhost:8730/login',
    scope: process.env.COGNITO_SCOPE || 'phone email openid profile',
  },

  // Google OAuth configuration — optional, off by default.
  google: {
    enabled: process.env.GOOGLE_ENABLED === 'true',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:8730/',
    scopes: process.env.GOOGLE_SCOPES || 'openid email profile',
  },

  // Microsoft (Azure AD) OAuth configuration — optional, off by default.
  microsoft: {
    enabled: process.env.MICROSOFT_ENABLED === 'true',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:8730/',
    scopes: process.env.MICROSOFT_SCOPES || 'openid email profile User.Read',
    authority:
      process.env.MICROSOFT_AUTHORITY ||
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
  },

  // White-label branding — env-driven so a self-hosted deployment (or a
  // hosted fork) can rebrand without a code change. See module/brand for the
  // public GET /api/brand endpoint the client fetches this from.
  brand: {
    name: process.env.VELTRIX_BRAND_NAME || 'Veltrix',
    tagline: process.env.VELTRIX_BRAND_TAGLINE || 'Security-as-Code',
    logoUrl: process.env.VELTRIX_BRAND_LOGO_URL || null,
  },
};

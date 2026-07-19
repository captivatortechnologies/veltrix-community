// ============================================================================
// Environment validation — single source of truth.
//
// FAILS FAST at import time (envalid's default reporter prints a formatted
// error and calls `process.exit(1)`) when a required variable is missing —
// most importantly the four secrets below. There are intentionally NO
// default/fallback values for secrets: a fallback here would mean a
// misconfigured deployment silently boots with a known, public, guessable
// key instead of refusing to start. Generate real values with e.g.
// `openssl rand -hex 32` (see .env.example).
//
// `server.ts` imports `./config` (which imports this module) as its very
// first statement, so this validation always runs before any route/module
// code — including any legacy `process.env.X || '<fallback>'` reads that
// may still exist deeper in the codebase — ever executes.
// ============================================================================

import { config as loadDotenv } from 'dotenv';
import { cleanEnv, str, port, bool, num } from 'envalid';

loadDotenv();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production', 'staging'], default: 'development' }),
  PORT: port({ default: 5000 }),

  // ---- Database (PostgreSQL) ----
  DATABASE_URL: str({ desc: 'PostgreSQL connection string' }),

  // ---- Redis (BullMQ job queue, cache, distributed rate limiting) ----
  REDIS_URL: str({ default: 'redis://localhost:6379' }),

  // ---- Secrets — REQUIRED, no fallback literals (fail-fast) ----
  JWT_SECRET: str({ desc: 'Signing secret for short-lived access tokens' }),
  JWT_REFRESH_SECRET: str({ desc: 'Signing secret for refresh tokens (must differ from JWT_SECRET)' }),
  ENCRYPTION_KEY: str({ desc: 'AES-256 key used to encrypt credentials at rest' }),
  COOKIE_SECRET: str({ desc: 'Signing secret for the CSRF double-submit cookie' }),

  // ---- Logging ----
  LOG_LEVEL: str({ choices: ['error', 'warn', 'info', 'debug'], default: 'info' }),

  // ---- Public URLs / CORS ----
  APP_URL: str({ default: 'http://localhost:8730' }),
  CORS_ORIGIN: str({ default: 'http://localhost:8730,http://localhost:5173' }),

  // ---- Email / SMTP (password-reset delivery) ----
  // Baseline configuration for outbound email. The admin UI (EmailSettings in
  // the DB) overrides all of these at runtime when enabled — see
  // module/email/email.config.ts. Everything here is optional: with no email
  // provider configured, a password-reset link is written to the server log
  // instead of being emailed, so a self-hoster can still recover accounts.
  EMAIL_PROVIDER: str({ choices: ['smtp', 'ses', 'none'], default: 'none' }),
  EMAIL_FROM: str({ default: '' }), // e.g. "Veltrix <no-reply@example.com>"
  // SMTP transport
  SMTP_HOST: str({ default: '' }),
  SMTP_PORT: num({ default: 587 }),
  SMTP_SECURE: bool({ default: false }), // true => TLS on connect (port 465)
  SMTP_USER: str({ default: '' }),
  SMTP_PASS: str({ default: '' }),
  // Amazon SES transport (uses the standard AWS credential chain if the keys
  // below are left blank — e.g. an instance role)
  SES_REGION: str({ default: '' }),
  SES_ACCESS_KEY_ID: str({ default: '' }),
  SES_SECRET_ACCESS_KEY: str({ default: '' }),
  // Password-reset token lifetime.
  PASSWORD_RESET_TTL_MINUTES: num({ default: 60 }),
});

export type Env = typeof env;

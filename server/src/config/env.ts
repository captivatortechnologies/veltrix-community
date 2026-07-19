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
import { cleanEnv, str, port } from 'envalid';

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
  APP_URL: str({ default: 'http://localhost:3000' }),
  CORS_ORIGIN: str({ default: 'http://localhost:3000,http://localhost:5173' }),
});

export type Env = typeof env;

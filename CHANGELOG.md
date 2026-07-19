# Changelog

All notable changes to Veltrix Community Edition are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Changes on `main` that have not yet been released will be listed here._

## [0.1.0] - 2026-07-18

Initial Community Edition extraction — the open-source, self-hostable core of the
Veltrix Security-as-Code platform, carved out of the private monorepo and
published under Apache-2.0 (SDKs under MIT).

### Added

- **Pipeline engine** — the mandatory change-delivery lifecycle for security
  configuration: author → validate → approve → deploy → monitor → drift-detect,
  with DIRECT, ROLLING, CANARY, and BLUE_GREEN deployment strategies, health
  checks, automatic rollback, and drift detection. Canary, blue-green, drift
  detection, and approval workflows are included free — they are the product, not
  an upsell.
- **App engine** — a plugin architecture where security tools integrate as apps:
  manifest parsing, a registry, per-app database isolation with migrations, an
  SSRF-hardened package ingest path, and the six-handler configuration-type
  contract (`validate`, `deploy`, `rollback`, `healthCheck`, `driftDetect`,
  `getStatus`).
- **Configuration canvas** — versioned authoring of configuration with history,
  comments, and approval records.
- **Job runner** — asynchronous pipeline jobs on BullMQ (backed by Redis). No
  external message broker is required.
- **RBAC and authentication** — role-based access control with a
  privilege-escalation guard, API keys, two-factor authentication, and
  AES-256-encrypted credential storage. Local authentication (bcrypt + JWT) is the
  default; OAuth/OIDC providers (Cognito, Google, Microsoft, generic OIDC) are
  optional and disabled by default.
- **Single-tenant organization model** — a default organization is seeded on
  first boot; the first-run administrator is created from `VELTRIX_ADMIN_EMAIL`.
- **React design system** — a shared component library and design tokens, plus
  the pipeline, canvas, apps, access-control, connectivity, and reports feature
  pages.
- **SDKs** — `@veltrix/sdk` (JavaScript/TypeScript) and `veltrix_sdk` (Python),
  published under MIT.
- **Self-host tooling** — a single-server `docker-compose.yml` (PostgreSQL,
  Redis, backend, frontend) and a Helm chart for Kubernetes, with all commercial
  feature flags off by default.
- **Documentation** — quickstart, architecture, app authoring, configuration, and
  an operations guide set (CI/CD, database backup, observability, read replicas).
- **Secrets gate** — a gitleaks configuration and a CI job that block credentials
  from entering the repository.

### Security

- **Fail-fast secrets** — the server aborts startup if `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, or `COOKIE_SECRET` is unset. No public
  fallback values ship.
- **No printed default credentials** — when `VELTRIX_ADMIN_PASSWORD` is blank, a
  random password is generated and printed once to the server log.

### Notes

This is an early, pre-1.0 release. Expect follow-up releases as the extraction is
hardened toward a fully green build and a stable public API.

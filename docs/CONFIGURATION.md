# Configuration Reference

Veltrix Community Edition is configured entirely through environment variables.
Copy the template and edit it:

```bash
cp .env.example .env
```

`.env` is gitignored and must never be committed. Only `.env.example` (with
placeholder values) is tracked. This page documents every variable in the
template.

> **Fail-fast secrets.** The server refuses to start if any of the required
> secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `COOKIE_SECRET`)
> is unset. There are no built-in fallback values, by design — an unconfigured
> instance never runs with a known/default secret.

---

## Core

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime mode. Use `production` for deployments. |
| `PORT` | `5000` | Port the backend listens on. |
| `APP_URL` | `http://localhost:8730` | Public URL of the client, used for CORS and generated links. |

## Database (PostgreSQL 16)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://veltrix:<password>@localhost:5432/veltrix`. When using the bundled Docker Compose stack, the password comes from `POSTGRES_PASSWORD`. |

## Cache / job queue (Redis 7)

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string. Redis powers BullMQ, which runs all pipeline jobs. No separate message broker is required. |

## Secrets (required — no defaults)

All four must be set to strong, unique values. Generate each with
`openssl rand -hex 32` (32 bytes of hex). **Startup aborts if any is missing.**

| Variable | Description |
|---|---|
| `JWT_SECRET` | Signs access tokens. |
| `JWT_REFRESH_SECRET` | Signs refresh tokens. Use a value different from `JWT_SECRET`. |
| `ENCRYPTION_KEY` | AES-256 key used to encrypt integration credentials at rest. Rotating this invalidates previously encrypted credentials. |
| `COOKIE_SECRET` | Signs session cookies. |

## First-run administrator

| Variable | Default | Description |
|---|---|---|
| `VELTRIX_ADMIN_EMAIL` | `admin@example.com` | Email of the administrator created on first boot. |
| `VELTRIX_ADMIN_PASSWORD` | _(empty)_ | Administrator password. **If left blank, a strong random password is generated and printed once to the server log.** Change it on first login. |

## Branding

The Community Edition brand is fully configurable — there is no hardcoded product
name in the UI.

| Variable | Default | Description |
|---|---|---|
| `VELTRIX_BRAND_NAME` | `Veltrix` | Product name shown in the UI. |
| `VELTRIX_BRAND_TAGLINE` | `Security-as-Code` | Tagline shown alongside the name. |
| `VELTRIX_BRAND_LOGO_URL` | _(empty)_ | URL of a logo image. Falls back to the default mark when empty. |

## Apps

| Variable | Default | Description |
|---|---|---|
| `APPS_DIR` | `./apps` | Directory the app engine discovers installed apps from — typically a checkout of the community apps repository. See [APP_AUTHORING.md](./APP_AUTHORING.md). |

## Email / SMTP (password-reset delivery)

Outbound email powers the self-service **password reset** flow. It is optional:
with no provider configured, a reset link is written to the **server log** so a
self-hoster can still recover accounts. Configure it two ways — the admin UI
(**Settings → Email**) stores config in the database (secrets encrypted at rest)
and **overrides** the environment variables below when enabled.

| Variable | Default | Description |
|---|---|---|
| `EMAIL_PROVIDER` | `none` | `smtp`, `ses`, or `none`. |
| `EMAIL_FROM` | — | From header, e.g. `Veltrix <no-reply@example.com>`. |
| `SMTP_HOST` | — | SMTP server hostname (SendGrid, Mailgun, Postmark, Gmail, …). |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | `false` | `true` = implicit TLS (port 465); `false` = STARTTLS (587). |
| `SMTP_USER` / `SMTP_PASS` | — | SMTP credentials. |
| `SES_REGION` | — | AWS region for the Amazon SES transport. |
| `SES_ACCESS_KEY_ID` / `SES_SECRET_ACCESS_KEY` | — | SES credentials. Leave blank to use the default AWS credential chain (e.g. an IAM instance role). |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | How long a reset link stays valid. |

> Reset tokens are single-use and stored only as a SHA-256 hash — the raw token
> exists solely in the emailed link. The forgot-password endpoint always returns
> the same response, so it can't be used to discover which emails are registered.

## Optional SSO

Authentication is **local** (bcrypt + JWT) by default. Each SSO provider is off
until you flip its flag to `true`, at which point you must supply that provider's
credentials.

| Variable | Default | Description |
|---|---|---|
| `FEATURE_OAUTH_COGNITO` | `false` | Enable AWS Cognito login. |
| `FEATURE_OAUTH_GOOGLE` | `false` | Enable Google login. |
| `FEATURE_OAUTH_MICROSOFT` | `false` | Enable Microsoft login. |
| `FEATURE_OAUTH_OIDC` | `false` | Enable a generic OIDC provider. |

Provide the matching credentials only when a provider is enabled:

| Variable | For |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT_ID` | Microsoft |
| `OIDC_ISSUER_URL` | Generic OIDC |

> Keep OAuth client secrets in `.env` (or your secret manager) — never commit
> them. The secrets gate will reject leaked credentials.

## Pipeline features (free — on by default)

These are the core product and are enabled by default in the Community Edition.
Leave them `true` unless you have a specific reason to disable a capability.

| Variable | Default | Description |
|---|---|---|
| `FEATURE_PIPELINE_DRIFT_DETECTION` | `true` | Detect configuration drift from the desired state. |
| `FEATURE_PIPELINE_CANARY` | `true` | Progressive canary rollouts. |
| `FEATURE_PIPELINE_BLUE_GREEN` | `true` | Blue-green deployments with atomic switch. |
| `FEATURE_PIPELINE_APPROVALS` | `true` | Approval gates before deployment. |

## Commercial features (not included — leave false)

These flags exist only as no-op seams. The functionality behind them (billing,
multi-tenant SaaS isolation) is **not part of the Community Edition**. Leave them
`false`.

| Variable | Default | Description |
|---|---|---|
| `FEATURE_BILLING` | `false` | Not included in the Community Edition. |
| `FEATURE_MULTI_TENANT` | `false` | Not included in the Community Edition. The Community Edition runs as a single organization. |

---

## Generating secrets quickly

```bash
for k in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY COOKIE_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done
```

Paste the output into `.env`, then set `DATABASE_URL` / `POSTGRES_PASSWORD` and
`VELTRIX_ADMIN_EMAIL`. See [QUICKSTART.md](./QUICKSTART.md) to bring the stack up.

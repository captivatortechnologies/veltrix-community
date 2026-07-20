# Secrets & Configuration

Veltrix Community Edition has **two layers** of secrets. This page ties them
together in one place; per-variable details live in
[`CONFIGURATION.md`](./CONFIGURATION.md), and the security rationale is in
[`../SECURITY.md`](../SECURITY.md).

| Layer | What | Set where | Stored where |
|---|---|---|---|
| **1. Infrastructure** | The keys the server needs to boot (JWT signing, encryption, cookies) + datastore credentials | Environment (`.env`, Helm values, or a secret manager) — **before boot** | Your `.env` / secret store; never in the database |
| **2. Application** | Credentials the app uses at runtime (email, integrations, SSO) | The **admin UI**, after install | The database, **encrypted at rest** with `ENCRYPTION_KEY` |

---

## Layer 1 — Infrastructure secrets (environment variables)

These are read at startup. The server **fails fast** (refuses to boot) if any of
the four required secrets is missing — there are no fallback defaults, by design
(`server/src/config/env.ts`).

### Required (server won't start without them)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens — **use a different value** than `JWT_SECRET` |
| `ENCRYPTION_KEY` | AES-256 master key that encrypts every Layer-2 secret at rest |
| `COOKIE_SECRET` | Signs the CSRF double-submit cookie |

Plus datastore access: `DATABASE_URL` (and `POSTGRES_PASSWORD` for the bundled
Postgres) and `REDIS_URL`.

### How to set them — by install method

**Docker, automatic (recommended for a first run).** `./scripts/quickstart.sh`
generates all four secrets with `openssl rand -hex 32`, writes them into a fresh
`.env`, and generates the first-run admin password:

```bash
./scripts/quickstart.sh
```

**Docker, manual.** Copy the template and fill the secrets yourself:

```bash
cp .env.example .env
# generate each of the four:
for k in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY COOKIE_SECRET; do
  echo "$k=$(openssl rand -hex 32)"
done
# paste the output into .env
```

See [`QUICKSTART.md`](./QUICKSTART.md) §2–3 for the step-by-step.

**Kubernetes (Helm).** Override the placeholder values — inline for a quick
start, or (recommended for production) via an external secret manager such as
**External Secrets Operator** or **Sealed Secrets**:

```bash
helm install veltrix helm/veltrix \
  --set backend.secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set backend.secrets.cookieSecret="$(openssl rand -hex 32)" \
  --set postgresql.auth.postgresPassword="$(openssl rand -hex 24)"
```

See [`../helm/veltrix/README.md`](../helm/veltrix/README.md) for the full values
and the external-secret-manager pattern.

### Rules

- **Never commit real secrets.** `.env` is gitignored; a gitleaks
  [`secrets-scan`](../.github/workflows/ci.yml) job fails CI on any leak. Run it
  locally with `pnpm secrets:scan`.
- **Generate strong, unique values per environment** (`openssl rand -hex 32`).
- **Rotating `JWT_SECRET` / `JWT_REFRESH_SECRET`** invalidates existing sessions
  (everyone must log in again) — otherwise safe.

---

## Layer 2 — Application secrets (managed in the UI, encrypted at rest)

These are entered **after install, from inside the app**, and stored in the
database **encrypted** with `ENCRYPTION_KEY` (`server/src/utils/encryption.ts`,
AES-256). The API never returns them in plaintext.

| Secret | Where you set it |
|---|---|
| **SMTP / SES email credentials** (password-reset delivery) | Settings → **Email** |
| **OAuth / OIDC / Cognito client secrets** and IdP config | Access Control → **Identity Providers** |
| **Integration / tool credentials** | The relevant app or Credentials screen |
| **Connectivity (ZTNA) provider configs** | Settings → **Connectivity** |
| **Cloud account credentials** | Settings → **Cloud Accounts** |
| **TOTP 2FA secrets** | Set automatically when a user enables 2FA |

> **API keys are the exception:** they are stored **hashed** (SHA-256), not
> encrypted — they can be verified but never recovered, so a leaked database read
> can't reveal a usable key. (Same for password-reset tokens.)

### `ENCRYPTION_KEY` is the master key — treat it accordingly

- **Back it up** somewhere separate from the database. A database restore is
  useless without the same `ENCRYPTION_KEY` — every Layer-2 secret would fail to
  decrypt.
- **Rotating `ENCRYPTION_KEY` is destructive to stored secrets.** Anything
  already encrypted with the old key becomes undecryptable. To rotate, plan to
  **re-enter every Layer-2 secret** (email, IdP, integrations, cloud) through the
  UI after changing the key.

---

## Quick decision guide

- Setting up a **fresh install**? → Layer 1, via `quickstart.sh` or `.env`
  (see [`QUICKSTART.md`](./QUICKSTART.md)).
- Configuring **email, SSO, or an integration**? → Layer 2, in the admin UI —
  no restart or env change needed.
- Going to **production**? → Put Layer-1 secrets in a secret manager, back up
  `ENCRYPTION_KEY`, and read [`../SECURITY.md`](../SECURITY.md).

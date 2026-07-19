# Veltrix Community Edition — End-to-End Tests

Playwright end-to-end tests that drive the real Veltrix Community Edition web UI (Vite
client on `:5173`) and API (Fastify on `:5000`) against a running dev stack and a seeded
Postgres database.

## Prerequisites

- A running Veltrix dev stack — client on `http://localhost:5173`, API on
  `http://localhost:5000/api` (see the repository root `README` / `docker-compose.yml`).
- A seeded database with the dev fixture user and the admin account.
- Google Chrome installed (the suite uses `channel: 'chrome'`; no browser download needed).
- Node >= 20.12 (for the built-in `.env` file loader used by `playwright.config.ts`).

## Setup

```bash
cd e2e
npm install
cp .env.e2e.example .env.e2e   # then fill in the passwords to match your local seed
```

All credentials come from the environment — nothing is hardcoded. Edit `.env.e2e`
(loaded automatically by `playwright.config.ts`) or export the variables directly. See
`.env.e2e.example` for the full list; the important ones are `E2E_PASSWORD` and
`E2E_ADMIN_PASSWORD`, which must match whatever your local seed created.

## Running

```bash
npm test            # run the whole suite (headless)
npm run test:headed # run headed (watch the browser)
npm run report      # open the last HTML report

# Iterate on a single spec without re-running the login setup (reuses storageState.json):
npx playwright test --project=verify tests/config-canvas.spec.ts
```

## How auth works

The `setup` project logs in once through the real login UI as the dev fixture user
(`dev@local.test`) and saves the session to `storageState.json`. The `chromium` project
depends on `setup` and reuses that session for every spec; `verify` is the same but skips
the setup dependency for fast single-spec iteration. `storageState*.json` holds live JWTs
and is gitignored — it is regenerated on every run.

## Specs

| Spec | Area |
|------|------|
| `app-shell.spec.ts` | App shell / navigation |
| `config-canvas.spec.ts` | Configuration Canvas authoring |
| `config-type-switch.spec.ts` | App config-type switching |
| `crowdstrike.spec.ts` | CrowdStrike reference app |
| `splunk-enterprise.spec.ts` | Splunk Enterprise reference app |
| `environments.spec.ts` | Environments + CSRF behavior |
| `cicd-workflow.spec.ts` | Pipeline / CI-CD workflow |
| `reviews.spec.ts` | Approval / review workflow |
| `rbac-permissions.spec.ts` | RBAC granularity + escalation guard |
| `idp-sso.spec.ts` | Identity provider / SSO (OIDC, uses `oauth2-mock-server`) |
| `portal-2fa.spec.ts` | Two-factor authentication (core 2FA) |

Shared code: `tests/helpers.ts` (API + login helpers), `tests/configHelpers.ts` (Canvas
locators), `tests/auth.setup.ts` (login setup project).

## Community Edition vs. commercial provisioning

`rbac-permissions.spec.ts`, `idp-sso.spec.ts`, and `portal-2fa.spec.ts` were carried from the
upstream suite where they ran under a hosted platform-admin identity. They are now decoupled
from that surface:

- `helpers.provisionTenant()` no longer posts to the excluded `/platform-admin/customers`
  route. In the single-tenant Community Edition it creates the fixture admin as a real
  `Administrator`-role user inside the default Organization via the OSS `GET /roles` +
  `POST /users` routes, so `rbac-permissions`, `portal-2fa`, and the bulk of `idp-sso` run
  against the OSS server unchanged.
- A few `idp-sso` steps assert behavior that only exists on the hosted multi-tenant surface —
  deactivating a user (`/platform-admin/users/:id/deactivate`) and suspending a tenant
  (`/platform-admin/customers/:id/disable`). Those steps are gated on
  `PLATFORM_ADMIN_AVAILABLE` (`helpers.ts`) and are **skipped by default**; set
  `E2E_PLATFORM_ADMIN=1` to run them against a commercial build.

> Note: the adapted specs target real OSS routes and type-check, but the full suite has not
> yet been executed against a live Community Edition stack in CI. Because CE collapses to one
> Organization, the `idp-sso` specs share a single tenant — run them in a single worker
> (`--workers=1`) if you see cross-test SSO-config interference until per-run isolation is added.

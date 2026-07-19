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

## Known follow-up

`rbac-permissions.spec.ts`, `idp-sso.spec.ts`, and `portal-2fa.spec.ts` were carried from
the upstream suite where they ran under a hosted platform-admin identity. Their
`helpers.provisionTenant()` fixture still posts to `/platform-admin/customers`, which is part
of the hosted/commercial surface that is not present in the Community Edition server. These
three specs therefore need decoupling from platform-admin provisioning (provision the fixture
tenant/user via the OSS user/role seed + admin APIs instead) before they run green against the
single-tenant OSS server. The config surgery has already re-homed all three to the `chromium`
(dev-user) project; only the provisioning seam remains.

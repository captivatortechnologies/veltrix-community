# Veltrix Community Edition

> **Security‑as‑Code, self‑hosted and free.** The open‑source core of the Veltrix
> Security Platform: a mandatory change‑delivery pipeline for security
> configuration, plus a plugin/app engine that lets any security tool wire into it.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
![Status: early](https://img.shields.io/badge/status-bootstrapping-orange.svg)

---

## What this is

Veltrix treats every security configuration change as code. Nothing reaches a
production security tool by hand — it flows through a single, auditable pipeline:

```
author → validate → approve → deploy (canary / blue‑green / rolling) → monitor → drift‑detect
```

Apps/plugins define **what** gets configured (Splunk indexes, firewall rules, IdP
policy, …); the pipeline owns **how** it is safely delivered, verified, and rolled
back. That pipeline, its app engine, the configuration canvas, version control,
RBAC, the React design‑system, and the developer SDKs are all open source here.

## Why it matters now: AI is changing your security tools

AI agents and copilots increasingly *make* security changes, not just suggest them
— tuning SIEM detections, editing IdP and firewall policy, rotating access. They
work at machine speed and scale, and they occasionally go confidently wrong. One
plausible‑but‑incorrect change to a detection rule or an access policy can open a
hole or take production down before anyone notices. The question is no longer
"can AI change our tools?" — it's **"who's checking its work?"**

Veltrix is the control plane that answers that. The same mandatory pipeline that
governs human changes governs AI‑authored ones:

- **AI proposes, humans approve.** Agents author changes through the API with
  scoped keys — but nothing deploys until a named person approves the actual
  diff, not a summary of it.
- **Blast radius stays contained.** Even approved changes roll out progressively,
  with canary steps, health checks, and automatic rollback — so a bad config is
  caught at 10% of the fleet, not 100%.
- **Drift is a tripwire.** If an agent (or anyone) edits a tool outside the
  pipeline, drift detection flags the delta against the last approved state and
  can alert on critical changes.
- **Everything has provenance.** Who or what proposed a change, who approved it,
  what deployed, and what it replaced are all recorded — ready for incident
  forensics and audits.

**AI drafts. Humans decide. The pipeline enforces.** Every guardrail above ships
in the Community Edition — it's the product, not an enterprise add‑on.

## What's in the Community Edition

| Included (free, self‑hostable) | Not included (hosted commercial add‑ons) |
|---|---|
| Pipeline engine (validate → approve → deploy → drift) | Billing, subscriptions, usage metering, trials |
| App / plugin engine + SDKs (JS / npm / Python) | Multi‑tenant SaaS isolation |
| Configuration Canvas + version control + approvals | Platform‑admin & MSSP operator portals |
| RBAC, auth (local + optional OAuth/OIDC), API keys | BYOL billing, managed cloud provisioning |
| React shared component library / design system | — |
| Docker Compose + Helm self‑host, core docs | — |

The premium capabilities (canary, blue‑green, drift detection, approval
workflows) are **free** in the Community Edition — they are the product, not an
upsell.

## Apps & integrations

The pipeline is the delivery mechanism; **apps** are what it delivers. Each app
teaches Veltrix how to manage one security tool's configuration as code — its
validate / deploy / rollback / health-check / drift-detect / status handlers,
canvas templates, migrations, and optional UI.

Apps live in their own open-source repository:

**→ [captivatortechnologies/veltrix-apps](https://github.com/captivatortechnologies/veltrix-apps)** — the official app catalog, the app SDK, and the developer CLI.

- **Install apps** from the published marketplace catalog, or point `APPS_DIR` at a
  local checkout of the repo (see [Configuration](#configuration)).
- **Build your own** against [`@veltrixsecops/app-sdk`](https://www.npmjs.com/package/@veltrixsecops/app-sdk),
  scaffold and validate with the Veltrix CLI, then open a PR — CI packages every
  merge into an immutable, checksummed release.

Apps built there install on both self-hosted Community Edition and the hosted
platform without changes.

## Status

🚧 **Bootstrapping.** This repository is being assembled by extracting and
cleaning the open‑source core out of the internal Veltrix monorepo. Expect the
tree to fill in over the coming commits (server core, app engine, DB schema,
client, SDKs, infra, docs). Track progress in the issues / project board.

## Quickstart

One command builds the images, generates secrets, migrates the database, and
boots the stack (it prints the generated admin login on first run):

```bash
./scripts/quickstart.sh     # or:  make quickstart
# → Web UI  http://localhost:3000
# → API     http://localhost:5000
```

Prefer to drive it yourself?

```bash
cp .env.example .env        # then fill in the secrets (openssl rand -hex 32)
docker compose up -d db redis
docker compose run --rm --no-deps server npx prisma migrate deploy
docker compose up -d server client
```

See [`docs/QUICKSTART.md`](./docs/QUICKSTART.md) for the full self‑host guide and
[`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) for every environment variable.
The verified end‑to‑end boot (build → migrate → seed → login) runs in CI as the
**Docker smoke test** job.

### Troubleshooting

Most first-run problems fall into a handful of buckets:

- **`port is already allocated` (or the stack won't bind).** The compose stack
  publishes host ports **3000** (web), **5000** (API), **5432** (Postgres), and
  **6379** (Redis). A local Postgres or Redis is the usual culprit. Stop the
  conflicting service, or remap the host side in `docker-compose.yml`
  (e.g. `"5433:5432"`) and update `DATABASE_URL` / `REDIS_URL` to match.
- **The `server` container exits immediately or restart-loops.** A required
  secret (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `COOKIE_SECRET`)
  is missing or still a `CHANGE_ME` placeholder — the server fails fast by
  design. Fill `.env` with real values (`openssl rand -hex 32` each; make the two
  JWT secrets different). Confirm the reason with `docker compose logs server`.
- **Can't log in — where's the admin password?** The first-run admin is
  `admin@example.com`. If you ran `quickstart.sh`, the password was printed by the
  script and saved to `.env` as `VELTRIX_ADMIN_PASSWORD`. If you booted manually
  without setting it, a random one was generated and printed **once** to the
  server log: `docker compose logs server | grep -i password`.
- **Login works but the app looks empty / you see seeding warnings.** The app
  auto-seeds on first boot, but only against a *migrated* database. If `server`
  started before `prisma migrate deploy` ran, apply the migration and restart:
  `docker compose restart server`. Seeding is idempotent, so re-running is safe.
- **`docker compose: command not found` or compose errors.** The stack needs
  Docker Compose **v2** (`docker compose`, with a space — not the legacy
  `docker-compose`). Update Docker Desktop or the Compose plugin. On Windows, run
  `scripts/quickstart.sh` from **Git Bash** or WSL, not PowerShell.
- **Start completely fresh.** Wipe the containers *and* volumes (this deletes the
  database), then re-run: `docker compose down -v && ./scripts/quickstart.sh`.

## Configuration

Everything is configured through environment variables. Copy the template and
fill it in — [`.env.example`](./.env.example) documents every variable inline, and
[`docs/CONFIGURATION.md`](./docs/CONFIGURATION.md) is the full reference:

```bash
cp .env.example .env
```

| Group | Variables | Notes |
|---|---|---|
| **Core** | `NODE_ENV`, `PORT`, `APP_URL` | `APP_URL` is the client's public URL (used for CORS and links). |
| **Datastores** | `DATABASE_URL`, `REDIS_URL` | PostgreSQL 16 and Redis 7 — Redis powers the BullMQ pipeline workers. |
| **Secrets** (required) | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `COOKIE_SECRET` | No defaults — the server **fails fast** if any is unset. Generate each with `openssl rand -hex 32`; keep the two JWT secrets distinct. |
| **First-run admin** | `VELTRIX_ADMIN_EMAIL`, `VELTRIX_ADMIN_PASSWORD` | Created on first boot. Leave the password blank and a random one is printed once to the server log. |
| **Branding** | `VELTRIX_BRAND_NAME`, `VELTRIX_BRAND_TAGLINE`, `VELTRIX_BRAND_LOGO_URL` | The Community Edition brand is fully configurable; served at `GET /api/brand`. |
| **Apps** | `APPS_DIR` | Directory the app engine discovers apps from — a checkout of the [apps repo](https://github.com/captivatortechnologies/veltrix-apps). |

### Feature flags

Capabilities toggle via `FEATURE_*` flags (the full set lives in `.env.example`):

- **Pipeline — free, on by default:** `FEATURE_PIPELINE_DRIFT_DETECTION`,
  `FEATURE_PIPELINE_CANARY`, `FEATURE_PIPELINE_BLUE_GREEN`,
  `FEATURE_PIPELINE_APPROVALS`. The premium delivery features, enabled out of the box.
- **Optional SSO — off by default:** `FEATURE_OAUTH_GOOGLE`, `FEATURE_OAUTH_MICROSOFT`,
  `FEATURE_OAUTH_OIDC`, `FEATURE_OAUTH_COGNITO`. Local auth is the default; enable a
  provider only alongside its credentials (`GOOGLE_CLIENT_ID`, `OIDC_ISSUER_URL`, …).
- **Commercial — not included, leave `false`:** `FEATURE_BILLING`,
  `FEATURE_MULTI_TENANT`, `FEATURE_HOSTED_CONNECTIVITY`, `FEATURE_CLOUD_PROVISIONING`
  belong to the hosted edition and have no effect here.

## Tech stack

- **Backend:** Fastify 5 · TypeScript · Prisma 6 · BullMQ (Redis)
- **Frontend:** React 18 · TypeScript · Tailwind CSS · lucide‑react
- **Data:** PostgreSQL 16 · Redis 7
- **Deploy:** Docker Compose (single server) · Helm (Kubernetes)

## Contributing

Issues and pull requests are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the workflow and review criteria, and please follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

Veltrix is security tooling, so the security of the project itself is a priority.
See [`SECURITY.md`](./SECURITY.md) for the full policy — the essentials:

- **Reporting a vulnerability.** Please do **not** open a public issue. Use GitHub's
  private reporting (the repository's **Security** tab → **Report a vulnerability**);
  we practice coordinated disclosure and aim to acknowledge within 3 business days.
- **Secrets gate.** Every push and pull request runs a gitleaks `secrets-scan` job
  (`.gitleaks.toml`) that fails the build on any finding. Run it locally with
  `pnpm secrets:scan` before you commit.
- **Secure by default.** The server fails fast if the required secrets (`JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `COOKIE_SECRET`) are unset — there are no
  fallback values. Integration credentials are encrypted at rest (AES-256), API keys
  are stored hashed (SHA-256), CSRF protection guards state-changing routes, auth is
  local-by-default (bcrypt + JWT) with OAuth/OIDC opt-in, and `.env` is never
  committed.

## License

[Apache License 2.0](./LICENSE). SDKs may be published under MIT — see each
package's own `LICENSE`.

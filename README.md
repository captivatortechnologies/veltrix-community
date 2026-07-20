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
# → Web UI  http://localhost:8730
# → API     http://localhost:8731
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
  publishes host ports **8730** (web), **8731** (API), **5432** (Postgres), and
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

## Deployment

The [Quickstart](#quickstart) runs the stack with Docker Compose — ideal for
evaluation and single-server self-hosting. For production, the repo also ships
first-class Kubernetes support:

| Path | Best for | Where |
|---|---|---|
| **Docker Compose** | Evaluation, single-server installs | [`docker-compose.yml`](./docker-compose.yml) |
| **Helm chart** | Production Kubernetes (recommended) | [`helm/veltrix/`](./helm/veltrix/) |
| **Raw manifests** | Kubernetes without Helm, or as a starting point | [`k8s/manifests/`](./k8s/manifests/) |

### Helm

The chart deploys the API and web client, bundles PostgreSQL and Redis subcharts
(disable them to use managed services), and exposes secrets, feature flags,
autoscaling, and ingress as values:

```bash
helm dependency update helm/veltrix
helm install veltrix helm/veltrix \
  --namespace veltrix --create-namespace \
  --set backend.image.repository=<registry>/veltrix-backend \
  --set frontend.image.repository=<registry>/veltrix-frontend \
  --set backend.secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set backend.secrets.cookieSecret="$(openssl rand -hex 32)" \
  --set postgresql.auth.postgresPassword="$(openssl rand -hex 24)" \
  --set ingress.hosts[0].host=veltrix.your-domain.example
```

For real deployments, override every placeholder secret (prefer an external
secret manager such as External Secrets Operator or Sealed Secrets), and set
`postgresql.enabled=false` / `redis.enabled=false` to point at managed database
and cache services. Full values reference: [`helm/veltrix/README.md`](./helm/veltrix/README.md).

### Raw Kubernetes manifests

Apply the bundled Deployments, Services, HPAs, ingress, network policies,
pod-disruption budgets, PostgreSQL (with a read replica), and Redis, plus the
Grafana observability dashboards:

```bash
kubectl apply -f k8s/manifests/
```

See [`k8s/manifests/README.md`](./k8s/manifests/README.md) for image/registry and
ingress setup.

### Run it as a service (systemd)

To manage the Docker Compose stack with systemd — start on boot, `systemctl
start`/`stop`/`restart` — install the bundled unit at
[`deploy/systemd/`](./deploy/systemd/). It wraps `docker compose up -d` / `down`.

### Running it in production

Operational guides live in [`docs/operations/`](./docs/operations/):

- [Database backups](./docs/operations/DATABASE-BACKUP.md)
- [Read replicas](./docs/operations/READ-REPLICAS.md)
- [Observability](./docs/operations/OBSERVABILITY.md) — Prometheus + Grafana
- [CI/CD](./docs/operations/CI-CD.md)

Whichever path you choose, supply strong per-environment secrets (see
[Configuration](#configuration)) — the server fails fast without them.

## Tech stack

- **Backend:** Fastify 5 · TypeScript · Prisma 6 · BullMQ (Redis)
- **Frontend:** React 18 · TypeScript · Tailwind CSS · lucide‑react
- **Data:** PostgreSQL 16 · Redis 7
- **Deploy:** Docker Compose (single server) · Helm (Kubernetes)

## Roadmap

Veltrix Community Edition is pre-1.0 (`0.1.x`) and moving quickly. The roadmap
below is directional, not a set of hard commitments — it's shaped in the open, so
[open an issue or discussion](https://github.com/captivatortechnologies/veltrix-community/issues)
to weigh in or propose something.

**Now → 1.0 (stabilization)**
- Freeze and document the public API and SDK surface so integrations can depend on it.
- Promote the manual [Playwright e2e suite](./e2e/README.md) to a required check once
  it's green against a live stack (the Docker smoke test already gates every PR).
- Round out the self-host docs — upgrades, backup/restore drills, and scaling guidance.

**Growing continuously**
- More security-tool integrations in the [apps catalog](#apps--integrations); the app
  engine and SDK are stable, so integrations ship independently of platform releases.
- Incremental pipeline depth — richer canary analysis and drift reporting.

**Post-1.0**
- A formal supported-version and security-fix window (see [`SECURITY.md`](./SECURITY.md)).
- Broader SSO and audit-export options.

Nothing here is dated; priorities follow real usage and contributions.

## FAQ

**Is it really free? What's the catch?**
Yes — the platform is [Apache-2.0](./LICENSE), self-hostable, with no seat limits
and no product telemetry. The premium delivery features (canary, blue-green, drift
detection, approvals) are included. Only hosted commercial add-ons — billing,
multi-tenant SaaS, the platform-admin/MSSP portals, and managed cloud provisioning
— live in the paid edition.

**How does this differ from hosted Veltrix?**
Same core: the pipeline, app engine, canvas, RBAC, and SDKs are identical. The
hosted service adds managed infrastructure, multi-tenancy, billing, MSSP operator
tooling, and SLA-backed support. See the [feature table](#whats-in-the-community-edition).

**Can I use it in production?**
You can deploy it (see [Deployment](#deployment)), but it's pre-1.0 (`0.1.x`) and the
public API/SDK surface isn't frozen yet — expect breaking changes between minor
versions until 1.0. Pin a version and read the release notes before upgrading.

**Is it single-tenant or multi-tenant?**
Single-tenant — one organization per instance. Multi-tenant SaaS isolation is a
hosted commercial feature (`FEATURE_MULTI_TENANT` has no effect here).

**Do I need an account or internet access?**
No. Authentication is local by default, and the platform doesn't phone home or send
product telemetry — it runs fully self-contained. OAuth/OIDC SSO is optional.

**Can I use it commercially?**
Yes. Apache-2.0 permits commercial use, modification, and redistribution; the SDKs
may be MIT — check each package's `LICENSE`.

**Can I rebrand it?**
Yes — set the `VELTRIX_BRAND_*` variables (see [Configuration](#configuration)); the
client reads the brand from `GET /api/brand` at runtime, so no rebuild is needed.

**How do I add support for my security tools?**
Install apps from the [apps catalog](#apps--integrations), or build your own with
`@veltrixsecops/app-sdk` and the Veltrix CLI.

**How do I report a security vulnerability?**
Privately, through GitHub's coordinated disclosure — see [Security](#security). Please
don't open a public issue.

## Contributing

Contributions of all kinds are welcome — bug reports, docs, tests, and code.
**[`CONTRIBUTING.md`](./CONTRIBUTING.md)** is the full guide (dev setup, code style,
testing, and the PR process); the essentials:

- **Set up** — Node 20 + pnpm 9, then `pnpm install` and `pnpm db:generate`; see
  [Configuration](#configuration) for the required secrets.
- **Branch** from `main`, keep changes focused, and add tests for any behavioral change.
- **Before pushing** — `pnpm lint`, `pnpm test`, and `pnpm build` must pass.
- **Commits** — [Conventional Commits](https://www.conventionalcommits.org/) with a
  DCO `Signed-off-by` line (`git commit -s`).
- **Open a PR** against `main` — CI runs the secrets scan and build/test, and one
  maintainer approval is required to merge.

Please also follow the [Code of Conduct](./CODE_OF_CONDUCT.md), and report security
issues privately per the [Security Policy](./SECURITY.md).

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

For how secrets are set up during installation — boot-time environment secrets
vs. UI-managed secrets encrypted at rest — see [`docs/SECRETS.md`](./docs/SECRETS.md).

## License

[Apache License 2.0](./LICENSE). SDKs may be published under MIT — see each
package's own `LICENSE`.

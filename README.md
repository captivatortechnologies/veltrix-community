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

## Tech stack

- **Backend:** Fastify 5 · TypeScript · Prisma 6 · BullMQ (Redis)
- **Frontend:** React 18 · TypeScript · Tailwind CSS · lucide‑react
- **Data:** PostgreSQL 16 · Redis 7
- **Deploy:** Docker Compose (single server) · Helm (Kubernetes)

## Contributing

Contribution guidelines, a code of conduct, and a security policy are on the way
(`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`). In the meantime, issues
and discussion are welcome.

## License

[Apache License 2.0](./LICENSE). SDKs may be published under MIT — see each
package's own `LICENSE`.

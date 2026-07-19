# Architecture

Veltrix Community Edition is a **Security-as-Code** platform. Every security
configuration change is treated as code and flows through one mandatory,
auditable pipeline. Security tools plug in as **apps**. This document describes
how the pieces fit together.

## Overview

Nothing reaches a target security tool by hand. Every change moves through a
single lifecycle:

```
author → validate → approve → deploy (canary / blue-green / rolling) → monitor → drift-detect
```

- **Apps** define *what* gets configured (indexes, roles, firewall rules, IdP
  policy, ...).
- **The pipeline** owns *how* that configuration is safely delivered, verified,
  and rolled back.

The advanced delivery capabilities — canary, blue-green, drift detection, and
approval workflows — are **included and free**. They are the core product, not an
upsell.

---

## Pipeline engine

Location: `server/src/core/pipeline-engine/`

The pipeline engine enforces a status lifecycle for every configuration change:

```
DRAFT -> VALIDATION_PENDING -> VALIDATION_FAILED / VALIDATED
      -> APPROVAL_PENDING    -> APPROVED / REJECTED
      -> QUEUED -> IN_PROGRESS -> HEALTH_CHECKING
      -> DEPLOYED / FAILED   -> ARCHIVED
```

Key components:

- **`pipeline.service.ts`** — orchestrates the lifecycle and dispatches to the
  relevant app handlers.
- **`pipeline.controller.ts`** — business logic for validation, deployment, and
  drift detection.
- **Deployment strategies** — pluggable strategies for how a change is rolled
  out: `DIRECT`, `ROLLING`, `CANARY`, and `BLUE_GREEN`.
- **Drift detector** — compares deployed configuration against live target state
  and records divergence.
- **Job runner** — asynchronous execution of pipeline work (see below).

Environment policy (per environment) controls whether a change requires approval,
how many approvers are needed, and which deployment strategy is used — for
example requiring two approvers and a canary rollout for production.

## App engine

Location: `server/src/core/app-engine/`

The app engine is the plugin architecture that lets security tools integrate with
the platform. Each app is a self-contained package:

```
<app-id>/
  manifest.yaml          # App metadata, permissions, configuration types
  handlers/
    <config-type>/
      validate.ts        # Validate configuration before deployment
      deploy.ts          # Deploy configuration to the target system
      rollback.ts        # Revert to the previous state on failure
      healthCheck.ts     # Verify target system health
      driftDetect.ts     # Detect drift from the desired state
      getStatus.ts       # Report current deployment status
  server/
    index.ts             # App-scoped API routes
  hooks/
    onInstall.ts         # Runs when the app is enabled
    onUninstall.ts       # Runs when the app is disabled
  migrations/
    001_initial.sql      # App-specific database schema (isolated per app)
```

The engine provides:

- a **registry** and **manifest parser**,
- a **migration runner** that isolates each app's schema in PostgreSQL,
- **app vetting** and an **SSRF-hardened package ingest** path for pulling app
  packages safely, and
- serving of app bundles, branding, and configuration.

### The six-handler contract

Every configuration type an app declares must implement six pipeline handlers:

1. `validate` — validates configuration before deployment.
2. `deploy` — applies configuration to the target system and captures rollback
   data.
3. `rollback` — restores the previous state from captured rollback data.
4. `healthCheck` — verifies the target system is healthy.
5. `driftDetect` — detects configuration drift from the desired state.
6. `getStatus` — reports current deployment status.

Apps are authored and distributed from the **separate community apps
repository**, which also hosts the app-authoring SDK and CLI. The app engine
discovers installed apps from the directory configured by `APPS_DIR`. See
[APP_AUTHORING.md](./APP_AUTHORING.md).

## Platform bootstrap

Location: `server/src/core/platform-bootstrap.ts`

On server start, bootstrap initializes the **app registry**, the **job runner**,
and the **pipeline service**, and wires up drift detection. It discovers and
loads installed apps so their handlers and routes are available to the pipeline.

## Job runner

Location: `server/src/core/job-runner/`

Pipeline work (validation, deployment, health checks, drift scans) runs
asynchronously on **BullMQ**, which is backed by **Redis**. There is no separate
message broker — Redis is the only queue substrate. An in-process event bus
carries app events between components.

## Configuration canvas, version control, and approvals

The **configuration canvas** is where operators author configuration. It is fully
versioned: every change is captured with history, comments, and approval records,
so you can see who changed what, when, and why — and roll back to any prior
version. Approval gates are enforced by the pipeline before a change can deploy.

Relevant server modules: `configuration-canvas`, `configuration-history`.

## Authentication, RBAC, and secrets

- **Authentication** is **local by default** (bcrypt-hashed passwords + JWT).
  Optional SSO providers (Cognito, Google, Microsoft, generic OIDC) can be enabled
  via feature flags; they are off by default. Two-factor authentication is
  supported.
- **RBAC** is role-based, with a **privilege-escalation guard** that prevents a
  user from granting privileges beyond their own. Permissions gate every
  sensitive route.
- **API keys** provide programmatic access for the SDKs and automation.
- **Credentials** for target systems are encrypted at rest with **AES-256** using
  `ENCRYPTION_KEY`.

Relevant server modules: `auth`, `role`, `api-key`, `credential`, `two-factor`,
`user`, `me`, `profile`.

## Organization model

The Community Edition runs as a **single organization** (workspace). A default
organization is seeded on first boot, and the first-run administrator is created
from `VELTRIX_ADMIN_EMAIL`. Ownership checks scope canvases, deployments, and
drift records to the organization.

## Feature flags

Location: `server/src/config/feature-flags.ts`

Feature flags are environment-variable-driven and evaluated on both server and
client:

```typescript
import { isFeatureEnabled } from './config/feature-flags'

if (isFeatureEnabled('pipeline.canaryDeployments')) {
  // Enable canary deployment logic
}
```

Categories relevant to the Community Edition:

- **`oauth.*`** — optional SSO providers (Cognito, Google, Microsoft, OIDC); off
  by default.
- **`pipeline.*`** — pipeline capabilities (drift detection, canary, blue-green,
  approvals); **on by default and free**.
- **`platform.*`** — platform features such as marketplace, audit log, and
  webhooks.

The client fetches its flags from `GET /api/feature-flags` on load. See
[CONFIGURATION.md](./CONFIGURATION.md) for the exact environment variables.

## API surface

Representative route prefixes in the Community Edition:

| Prefix | Description |
|---|---|
| `/api/auth/*` | Authentication |
| `/api/me`, `/api/profile` | Current user and profile |
| `/api/roles`, `/api/users` | RBAC administration |
| `/api/api-keys` | API key management |
| `/api/pipeline/*` | Pipeline operations (validate, deploy, rollback, drift) |
| `/api/apps/*` | App management (list, enable, disable) and app-scoped routes |
| `/api/configuration-canvas/*` | Canvas CRUD |
| `/api/configuration-history/*` | Version history and approvals |
| `/api/environments`, `/api/tags` | Environments and tags |
| `/api/tools`, `/api/components`, `/api/credentials` | Inventory and connectivity |
| `/api/connectivity/*`, `/api/tailscale` | BYO connectivity adapters |
| `/api/webhooks` | Outbound webhooks |
| `/api/feature-flags` | Client feature flags |

## Client

Location: `client/src/`

The frontend is a React application built around a **shared design system** — a
library of UI primitives (buttons, inputs, data tables, dialogs, toasts, badges,
stats cards, tabs, ...) plus design tokens and Tailwind configuration. Composite
features include the configuration canvas, version control, and the pipeline UI
(dashboard, environment matrix, drift view), along with pages for environments,
apps, access control, connectivity, and reports. The design system is also
published as a standalone package (`packages/ui`).

## Deployment

### Docker Compose (single server)

```bash
docker compose up -d
```

Four services: PostgreSQL 16, Redis 7, backend (Fastify), frontend (React). See
[QUICKSTART.md](./QUICKSTART.md).

### Helm (Kubernetes)

A Helm chart is provided for self-hosting on Kubernetes:

```bash
helm install veltrix ./helm/veltrix \
  --set backend.secrets.jwtSecret=<secret> \
  --set backend.secrets.cookieSecret=<secret>
```

Key values include `backend.replicaCount`, `backend.autoscaling.enabled`,
`ingress.enabled` (with TLS), and `featureFlags.*` overrides. PostgreSQL and Redis
are provided via Bitnami subcharts and are off/optional-configurable per your
environment.

## Tech stack

- **Backend:** Fastify 5 · TypeScript · Prisma 6 · BullMQ
- **Frontend:** React 18 · TypeScript · Tailwind CSS · lucide-react
- **Data:** PostgreSQL 16
- **Cache / queue:** Redis 7 (BullMQ)
- **Deploy:** Docker Compose (single server) · Helm (Kubernetes)

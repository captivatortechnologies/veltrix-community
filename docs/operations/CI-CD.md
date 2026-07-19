# CI/CD Guide

Guidance for building and operating a CI/CD pipeline for a self-hosted Veltrix
deployment: deployment strategies, pull-request checks, branch protection,
monitoring, and automated rollback.

> **Scope.** The Community Edition ships a CI workflow for **build, test, and a
> secrets scan** (`.github/workflows/ci.yml`), plus deployment helper **scripts**
> under `scripts/` (`blue-green-deploy.sh`, `canary-deploy.sh`,
> `auto-rollback.sh`). A production *deployment* workflow is inherently specific
> to your cluster and hosting, so it is left for you to author. This guide
> describes the strategies and patterns to build one. Substitute your own cluster,
> registry, namespace, and credential values for the placeholders shown here.

## Table of contents

- [Overview](#overview)
- [Deployment strategies](#deployment-strategies)
- [Pull-request checks](#pull-request-checks)
- [Branch protection](#branch-protection)
- [Monitoring & rollback](#monitoring--rollback)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Best practices](#best-practices)

## Overview

A complete CI/CD setup for Veltrix typically provides:

- **Automated testing** — unit tests, integration tests, and code-quality checks.
- **Security scanning** — a secrets scan (gitleaks), container vulnerability
  scanning, and dependency audits.
- **Multiple deployment strategies** — blue-green, canary, and rolling.
- **Automated rollback** — health monitoring that rolls back on failure.
- **Approval gates** — manual approval for production deployments.
- **Branch protection** — enforced code review and status checks.

```
Pull request  → checks  → code quality, tests, secrets & security scan
Main branch   → build   → staging → approval → production
                              ↓
        Blue-green / canary / rolling deployment
                              ↓
        Monitoring → automatic rollback on failure
```

## Deployment strategies

### Blue-green

**Use when** you need instant rollback, cannot afford downtime, have resources for
duplicate environments, or are testing major version changes.

```bash
./scripts/blue-green-deploy.sh <namespace> <image> <environment> [--auto-approve]
```

How it works:

1. Deploy the new version alongside the current one (Blue + Green).
2. Run health checks and smoke tests.
3. Optionally require manual approval.
4. Switch traffic atomically.
5. Monitor for a stabilization window (default 60s).
6. Scale the old version down to zero (kept for instant rollback).

| Property | Value |
|---|---|
| Zero downtime | Yes |
| Resource usage | High (2x during deployment) |
| Rollback time | Instant (1–2s) |
| Risk | Low |
| Complexity | Medium |

### Canary

**Use when** you want a gradual rollout with real traffic, need to validate
performance under load, and can monitor metrics in real time.

```bash
./scripts/canary-deploy.sh <namespace> <image> <environment> [--auto-promote]
```

How it works:

1. Start with ~5% of traffic on the new version.
2. Monitor error rate (default threshold 5%) and P95 latency (default 500ms).
3. Progressive rollout: 5% → 10% → 25% → 50% → 100%.
4. Optional manual approval at 50%.
5. Auto-rollback if thresholds are breached.
6. At 100%, promote the canary to stable.

| Stage | Stable replicas | Canary replicas | Canary traffic |
|---|---|---|---|
| 1 | 10 | 1 | ~5% |
| 2 | 10 | 2 | ~10% |
| 3 | 10 | 3 | ~25% |
| 4 | 10 | 10 | ~50% |
| 5 | 0 | 10 | 100% |

| Property | Value |
|---|---|
| Zero downtime | Yes |
| Resource usage | Medium (1.1–2x during rollout) |
| Rollback time | Fast (30–120s) |
| Risk | Very low (gradual exposure) |
| Complexity | High |

Wire the canary's metric checks to your own monitoring, for example Prometheus for
error rate and an APM for latency:

```bash
check_error_rate() {
    kubectl exec -n monitoring prometheus-0 -- promtool query instant \
        'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100'
}
```

### Rolling (standard)

**Use when** it is the default, resources are limited, and you can tolerate a
brief period of mixed versions.

```bash
kubectl set image deployment/<app> <app>=<image> -n <namespace>
kubectl rollout status deployment/<app> -n <namespace>
```

| Property | Value |
|---|---|
| Zero downtime | Yes (if configured correctly) |
| Resource usage | Low (1x + small buffer) |
| Rollback time | Medium (2–5 min) |
| Risk | Medium |
| Complexity | Low |

## Pull-request checks

The bundled `ci.yml` runs on every pull request to `main`:

1. **Secrets scan** — gitleaks with the repository's `.gitleaks.toml`. A finding
   fails the build (see [../../SECURITY.md](../../SECURITY.md)).
2. **Build & test** — installs dependencies, generates the Prisma client, builds
   all workspaces, and runs the test suites against PostgreSQL and Redis service
   containers.

A fuller PR pipeline often adds:

- **Code quality** — ESLint, Prettier, TypeScript compilation.
- **Coverage threshold** — e.g. 70% minimum, with a coverage artifact.
- **Container scan** — e.g. Trivy, with SARIF upload to the Security tab.
- **Docker build test** — validate the multi-stage build without pushing.
- **PR size / summary** — warn on very large diffs; post an automated summary.

These extra jobs require no special secrets beyond the default `GITHUB_TOKEN`.

## Branch protection

Protect `main` with a rule that requires review and passing checks. You can apply
it in the repository settings, via the GitHub API, or with a script:

```bash
export GITHUB_TOKEN=<a token with repo admin scope>
./scripts/configure-branch-protection.sh <owner> <repo>
```

Recommended `main` protection:

- Require a pull request before merging.
- Require at least one (or two) approvals, including code-owner review.
- Require status checks to pass: secrets scan, build & test, and any code-quality
  or container-scan jobs you add.
- Require the branch to be up to date and all conversations resolved.
- Enforce a linear history; disable force-push and branch deletion.
- Apply the rule to administrators too.

### CODEOWNERS

Create `.github/CODEOWNERS` to route reviews. Use your own teams/handles:

```
# Default owners
* @your-org/maintainers

# Backend
/server/** @your-org/backend

# Frontend
/client/** @your-org/frontend

# Database
/server/prisma/** @your-org/backend

# Infrastructure / CI
/helm/** @your-org/devops
/.github/** @your-org/devops
```

## Monitoring & rollback

### Automated rollback

Continuous monitoring with automatic rollback on failure:

```bash
# Start monitoring in the background
./scripts/auto-rollback.sh <namespace> <app> <environment> &

# Watch its log
tail -f /tmp/veltrix-rollback.log
```

Checks (typically every 30s): pod health, deployment status (progressing /
available / replica count), error rate (threshold 5%), and latency (P95 500ms).

Rollback triggers:

- 3 consecutive failed health checks
- error rate > 5% for 90s
- P95 latency > 500ms for 90s
- pod crash loop detected
- deployment not progressing

Notifications can be routed to your incident channels (e.g. a chat webhook, an
on-call/paging service, or email).

### Manual rollback

```bash
kubectl rollout undo deployment/<app> -n <namespace>
kubectl rollout undo deployment/<app> -n <namespace> --to-revision=<n>
kubectl rollout history deployment/<app> -n <namespace>
```

## Configuration

### Pipeline secrets

Store deployment credentials in your CI secret store (never in the repo):

```
KUBE_CONFIG          # base64-encoded kubeconfig for the target cluster
REGISTRY_TOKEN       # token for your container registry
NOTIFY_WEBHOOK_URL   # chat/incident webhook (optional)
PROMETHEUS_URL       # Prometheus endpoint (for canary / auto-rollback)
APM_API_KEY          # APM key for latency checks (optional)
```

### Tunable script parameters

Adjust near the top of each script:

```bash
# Blue-green
HEALTH_CHECK_TIMEOUT=300
MONITORING_PERIOD=60

# Canary
CANARY_STAGES=(5 10 25 50 100)
STAGE_DURATION=60
ERROR_THRESHOLD=5.0
LATENCY_THRESHOLD=500

# Auto-rollback
CHECK_INTERVAL=30
FAILED_CHECKS_THRESHOLD=3
```

### Kubernetes labels

Blue-green switching relies on a `version` label on the deployment and pod
template; the service selector is updated to point at the active version.

```yaml
metadata:
  labels:
    app: myapp
    version: v2.0.0   # required for blue-green
```

## Troubleshooting

**Workflow fails with permission denied (push / registry).** Add the needed
permissions to the workflow:

```yaml
permissions:
  contents: read
  packages: write
  security-events: write
```

**`kubectl: command not found` in a runner.** Install kubectl in the job, or run
it from a container image that includes it.

**Health checks always fail after deploy.** Inspect readiness with
`kubectl describe pod <pod> -n <namespace>`; common fixes are increasing
`initialDelaySeconds`, accounting for slow startup, or correcting the health
endpoint.

**Canary rolls back under normal load.** Your thresholds may be too tight. Raise
`ERROR_THRESHOLD` / `LATENCY_THRESHOLD`, or compare against a baseline rather than
an absolute value.

**Branch protection blocks an emergency fix.** Prefer a documented break-glass
process (temporary rule relaxation with an audit trail) over disabling protection
ad hoc.

## Best practices

**Choosing a strategy**

- **Blue-green** for major versions, schema changes needing backward
  compatibility, and anything requiring instant rollback.
- **Canary** for minor/patch changes where you want to validate with real traffic.
- **Rolling** for low-risk bug fixes and non-production environments.

**Pre-production checklist**

- [ ] Unit tests pass (coverage at your threshold)
- [ ] Integration tests pass
- [ ] Secrets and security scans clean
- [ ] Staging deployment and smoke tests pass
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring/alerts configured

**Alert thresholds (starting points)**

| Metric | Warning | Critical |
|---|---|---|
| Error rate | > 1% | > 5% |
| P95 latency | > 200ms | > 500ms |
| CPU usage | > 70% | > 90% |
| Memory usage | > 75% | > 90% |
| Pod restarts | > 2/hour | > 5/hour |

**Security**

- Never commit secrets; use your CI secret store or an external secret manager.
- Scan images before deployment and fail on critical/high findings.
- Scope deployment service accounts to the minimum required RBAC.

**Incident response**

1. Detect (automated alert fires).
2. Assess (dashboards, recent deployments, scope of impact).
3. Respond (roll back if deployment-related; scale/restart if infrastructure).
4. Resolve (verify recovery, monitor for a stabilization window).
5. Post-mortem (timeline, root cause, action items).

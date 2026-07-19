# Veltrix Helm Chart

Deploys Veltrix Community Edition to Kubernetes: a backend (Fastify API + BullMQ
job runner), a frontend (static SPA served by nginx), and — by default — bundled
Bitnami PostgreSQL and Redis subcharts. There is **no message broker**; background
jobs run on BullMQ over Redis.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- An ingress controller (the chart assumes `ingress-nginx`)
- Container images for the backend and frontend. The project does not publish
  official images — build them yourself:

  ```sh
  docker build -t <registry>/veltrix-backend:latest -f server/Dockerfile .
  docker build -t <registry>/veltrix-frontend:latest -f client/Dockerfile .
  docker push <registry>/veltrix-backend:latest
  docker push <registry>/veltrix-frontend:latest
  ```

## Install

```sh
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

## Secrets

Every secret in `values.yaml` is a placeholder (`changeme` / empty). **Override
them for any real deployment.** Do not commit real values. For production prefer
an external secret manager (e.g. External Secrets Operator, Sealed Secrets) and
supply `backend.secrets.databaseUrl` / `redisUrl` directly rather than relying on
the bundled subcharts' default credentials.

## Feature flags

Optional OAuth/OIDC integrations (Cognito, Google, Microsoft) are **off by
default** under `featureFlags`; local auth is the default. The pipeline features
(drift detection, canary, blue-green, approvals) are **on** and free.

## Using an external database / cache

Set `postgresql.enabled=false` and/or `redis.enabled=false`, then provide
`backend.secrets.databaseUrl` and `backend.secrets.redisUrl` pointing at your
managed services.

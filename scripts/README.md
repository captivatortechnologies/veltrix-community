# scripts/

Optional helper scripts. None are required to run Veltrix — the Helm chart and
Docker Compose stack are self-contained.

## Progressive-delivery helpers (Kubernetes)

Generic `kubectl`-based scripts. They target namespace `veltrix` by default
(override with the last argument) and assume `<service>-service` Services and
`/health` endpoints as created by the raw manifests / Helm chart.

- `blue-green-deploy.sh <service> <image-tag> [namespace]` — stand up the idle
  color, smoke-test it, switch the Service selector, then scale down the old color.
- `canary-deploy.sh <service> <image-tag> [namespace]` — progressive 5→10→25→50→100%
  rollout with health/metric gates and automatic rollback. The error-rate and
  latency checks are stubs — wire them to your Prometheus/APM before relying on them.
- `auto-rollback.sh <service> [namespace]` — watchdog loop that runs
  `kubectl rollout undo` after N consecutive failed health checks. Metric checks
  are stubs; wire them to your monitoring.

## Static-site link checker

- `check-www-links.py [dir]` — validates internal `href`/`src` links and
  `data-component` references across `.html` files. Exits non-zero on any broken
  reference. Useful in CI for a static docs/marketing site.

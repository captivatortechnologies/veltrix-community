# Raw Kubernetes manifests (advanced / optional)

The **[Helm chart](../../helm/veltrix)** is the recommended, maintained way to run
Veltrix on Kubernetes. These raw manifests are an optional lower-level alternative
for users who prefer plain `kubectl apply` or want a starting point to customize.
They are not kept in perfect lockstep with the chart.

Before applying:

- Build and reference your own container images — replace `BACKEND_IMAGE` in
  `backend-deployment.yaml` and `FRONTEND_IMAGE` in `frontend-deployment.yaml`.
- Replace every `CHANGE_ME` placeholder secret (in `backend-deployment.yaml` and
  `postgres-deployment.yaml`). Prefer an external secret manager.

Suggested apply order:

```sh
kubectl apply -f namespace.yaml
kubectl apply -f postgres-pv.yaml -f postgres-pvc.yaml -f postgres-deployment.yaml -f postgres-service.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f backend-deployment.yaml -f backend-service.yaml -f backend-hpa.yaml
kubectl apply -f frontend-deployment.yaml -f frontend-service.yaml -f frontend-hpa.yaml
kubectl apply -f network-policies.yaml -f pod-disruption-budgets.yaml
kubectl apply -f ingress.yaml
```

Optional extras:

- `postgres-replica.yaml` — streaming read replica (needs extra secrets and
  storage classes; see comments in the file).
- `observability.yaml` — Prometheus + Grafana + Jaeger stack in an `observability`
  namespace.
- `grafana-dashboard-application.json`, `grafana-dashboard-infrastructure.json` —
  import into Grafana.

Background jobs run on **BullMQ over Redis** — there is no message broker.

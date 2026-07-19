# Observability

Deploying and configuring an observability stack — OpenTelemetry, Prometheus,
Grafana, and Jaeger — for a self-hosted Veltrix deployment: metrics, distributed
traces, dashboards, and alerts.

> Every credential shown here is a placeholder. Set your own values and store them
> as secrets — never commit them. This stack is **optional**.
>
> **License note:** Grafana is licensed under AGPL-3.0. If you bundle or
> redistribute a Grafana image or dashboards, review its license obligations. The
> other components named here (Prometheus, Jaeger, OpenTelemetry) are Apache-2.0.

## Table of contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Dashboards](#dashboards)
- [Alerts](#alerts)
- [Troubleshooting](#troubleshooting)
- [Best practices](#best-practices)

## Overview

The stack provides:

- **Distributed tracing** — OpenTelemetry + Jaeger for request-flow visualization.
- **Metrics** — Prometheus for time-series metrics.
- **Visualization** — Grafana dashboards.
- **APM** — application performance monitoring with custom business metrics.

```
Application (server + client)
   │  OpenTelemetry SDK, custom metrics, trace propagation
   ▼
Collection: Jaeger collector (OTLP 4317/4318)  |  Prometheus (scrape, retention)
   ▼
Visualization: Grafana (Prometheus + Jaeger datasources, dashboards, alerting)
```

## Prerequisites

Required:

- Kubernetes cluster (v1.24+) with `kubectl` configured
- ~8 GB RAM for the observability stack
- ~100 GB storage for metric retention (adjust to your retention policy)

Optional:

- An ingress controller and cert-manager for TLS
- External long-term storage for metrics/traces

## Installation

### 1. Install SDK dependencies

Server:

```bash
cd server
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api \
  @opentelemetry/exporter-prometheus
```

Client:

```bash
cd ../client
npm install --save \
  @opentelemetry/sdk-trace-web \
  @opentelemetry/auto-instrumentations-web \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/context-zone \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/instrumentation \
  @opentelemetry/api
```

### 2. Deploy the stack

```bash
kubectl create namespace observability
kubectl apply -f k8s/manifests/observability.yaml
kubectl get pods -n observability
```

### 3. Configure the application

Server (`.env`):

```bash
OTEL_SERVICE_NAME=veltrix-server
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger-collector.observability:4318
OTEL_ENABLE_TRACING=true
OTEL_ENABLE_METRICS=true
PROMETHEUS_PORT=9464
```

Client (`.env`):

```bash
VITE_OTEL_SERVICE_NAME=veltrix-client
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://<your-collector-host>:4318
VITE_OTEL_ENABLE_TRACING=true
VITE_OTEL_SAMPLE_RATE=0.1
```

### 4. Scrape annotations on server pods

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9464"
    prometheus.io/path: "/metrics"
```

### 5. Access the dashboards

```bash
kubectl port-forward -n observability svc/grafana 3000:80     # http://localhost:3000
kubectl port-forward -n observability svc/jaeger-query 16686:16686
kubectl port-forward -n observability svc/prometheus 9090:9090
```

Log in to Grafana with the admin credentials you configured (see below). Do not
run with a default password.

## Configuration

### Prometheus retention

```yaml
args:
  - '--storage.tsdb.retention.time=90d'
  - '--storage.tsdb.retention.size=100GB'
```

### Grafana admin password

Set the admin password via a secret; never leave it at a default:

```bash
kubectl create secret generic grafana-secrets \
  --from-literal=admin-password='<CHANGE_ME>' \
  -n observability --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/grafana -n observability
```

### Jaeger storage (production)

For production, use durable storage (Elasticsearch, Cassandra):

```yaml
env:
  - name: SPAN_STORAGE_TYPE
    value: "elasticsearch"
  - name: ES_SERVER_URLS
    value: "http://elasticsearch:9200"
  - name: ES_USERNAME
    value: "elastic"
  - name: ES_PASSWORD
    valueFrom:
      secretKeyRef: { name: elasticsearch-credentials, key: password }
```

### Alert rules (example)

```yaml
groups:
  - name: veltrix-alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations: { summary: "High 5xx error rate on {{ $labels.instance }}" }

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels: { severity: warning }
        annotations: { summary: "High P95 latency on {{ $labels.instance }}" }
```

## Dashboards

Import dashboards through the Grafana UI (Dashboards → Import) or provision them
from a ConfigMap. Useful PromQL to build panels:

```promql
# Request rate
rate(http_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error percentage
sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# Cache hit rate
sum(rate(cache_hits_total[5m])) / (sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m]))) * 100
```

## Alerts

Route Prometheus alerts through Alertmanager to your notification channels. Keep
the webhook URL in a secret:

```yaml
global:
  # Set via secret; do not inline a real webhook here
  slack_api_url: '<CHANGE_ME>'
route:
  group_by: ['alertname']
  receiver: 'default'
  routes:
    - match: { severity: critical }
      receiver: 'critical'
receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'
        title: 'Alert: {{ .GroupLabels.alertname }}'
  - name: 'critical'
    slack_configs:
      - channel: '#critical'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
```

## Troubleshooting

**Metrics not appearing.** Check Prometheus targets at
`http://localhost:9090/targets` (all should be `UP`) and confirm the scrape
annotations on your pods.

**Traces not in Jaeger.** Verify connectivity to the OTLP endpoint from a server
pod and confirm the `OTEL_*` environment variables are set.

**High memory use in Prometheus.** Reduce retention, or enable remote write to
long-term storage (keep any `basic_auth` credentials in a secret, not inline).

**Performance impact.** Lower the client sample rate (e.g.
`VITE_OTEL_SAMPLE_RATE=0.01`) and use batched span processing on the server.

## Best practices

1. Start with low sample rates (~10%) in production and increase gradually.
2. Alert on the signals that matter: error rate, latency, and memory.
3. Propagate trace context across all services.
4. Monitor the monitors (Prometheus self-monitoring).
5. Set retention based on your compliance requirements.
6. Store all credentials (Grafana admin, datasource, webhook) as secrets.

## Next steps

- Configure long-term storage for metrics/traces.
- Define SLOs/SLIs for key user journeys and write runbooks for common alerts.
- Add log aggregation (e.g. Loki or an ELK stack) alongside metrics and traces.

# Operations Guides

Production-oriented guidance for running Veltrix Community Edition yourself. These
guides are deliberately generic — they describe patterns and commands you can
adapt to your own infrastructure, not a specific hosting environment. Wherever a
guide shows a password, bucket name, host, or credential, treat it as a
placeholder and substitute your own value (shown as `<CHANGE_ME>` or similar).

| Guide | What it covers | Applies to |
|---|---|---|
| [CI/CD](./CI-CD.md) | Deployment strategies (blue-green, canary, rolling), pull-request checks, branch protection, monitoring, and automated rollback. | All deployments |
| [Database Backup & Recovery](./DATABASE-BACKUP.md) | PostgreSQL backup, restore, point-in-time recovery, and disaster-recovery runbooks. | All deployments |
| [Observability](./OBSERVABILITY.md) | OpenTelemetry, Prometheus, Grafana, and Jaeger for metrics, traces, dashboards, and alerts. | Optional |
| [Read Replicas](./READ-REPLICAS.md) | PostgreSQL streaming replication and read/write query routing. | Advanced / optional |

For getting started, see [../QUICKSTART.md](../QUICKSTART.md). For architecture,
see [../ARCHITECTURE.md](../ARCHITECTURE.md).

# PostgreSQL Read Replicas

> **Advanced / optional.** Most self-hosted deployments do not need read replicas.
> Add them only when read load or availability requirements justify the added
> operational complexity. All passwords shown are placeholders (`<CHANGE_ME>`) —
> set your own and store them as secrets.

Setting up PostgreSQL streaming replication and routing reads to replicas for
improved read throughput and higher availability.

## Overview

Read replicas provide:

- horizontal scaling for read-heavy workloads,
- higher availability with failover,
- reporting isolation from production writes, and
- an additional disaster-recovery capability.

```
Application
   ├── writes → Primary (read/write)
   └── reads  → Load balancer → Replica 1 / Replica 2 / Replica 3 (read-only)
                                     ▲
Primary ── streaming replication ────┘
```

## Quick start

### 1. Environment configuration

```bash
# Primary
POSTGRES_HOST=postgres-primary.veltrix.svc.cluster.local
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<CHANGE_ME>
POSTGRES_DB=veltrix
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}

# Read replicas (comma-separated host:port:weight; higher weight = more traffic)
POSTGRES_REPLICA_HOSTS=postgres-replica-0:5432:2,postgres-replica-1:5432:2,postgres-replica-2:5432:1

# Replication user
REPLICATION_USER=replicator
REPLICATION_PASSWORD=<CHANGE_ME>
```

### 2. Deploy Kubernetes resources

```bash
kubectl create namespace veltrix

kubectl create secret generic postgres-credentials \
  --from-literal=username=postgres \
  --from-literal=password='<CHANGE_ME>' \
  -n veltrix

kubectl create secret generic postgres-replication \
  --from-literal=password='<CHANGE_ME>' \
  -n veltrix

kubectl apply -f k8s/manifests/postgres-replica.yaml
kubectl get pods -n veltrix -l role=replica
```

### 3. Configure the primary and initialize replicas

```bash
# On the primary
kubectl exec -it postgres-primary-0 -n veltrix -- \
  ./scripts/setup-replication.sh --mode primary --replica-count 3

# On each replica
kubectl exec -it postgres-replica-0 -n veltrix -- \
  ./scripts/setup-replication.sh --mode replica \
  --primary-host postgres-primary.veltrix.svc.cluster.local
```

## Application integration

The application routes reads and writes through a small pool wrapper:

```typescript
import { db } from './db-pool';

// Read from replicas (load balanced)
const tools = await db.read.tool.findMany();

// Write to the primary
const newTool = await db.write.tool.create({ data: { /* ... */ } });

// Transactions always run on the primary
await db.transaction(async (tx) => {
  await tx.tool.create({ data: { /* ... */ } });
  await tx.deployment.create({ data: { /* ... */ } });
});
```

### Read-after-write consistency

Reading your own write from a replica may return stale data due to replication
lag. Read from the primary when you need the value you just wrote:

```typescript
const newTool = await db.write.tool.create({ data });
const fresh = await db.primary.tool.findUnique({ where: { id: newTool.id } });
```

### Service-layer pattern

```typescript
export class ToolService {
  findAll()      { return db.read.tool.findMany(); }               // reads → replicas
  create(data)   { return db.write.tool.create({ data }); }        // writes → primary
  update(id, d)  { return db.write.tool.update({ where: { id }, data: d }); }
}
```

## Monitoring and health checks

### On the primary

```sql
SELECT application_name, client_addr, state, sync_state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS send_lag_bytes,
       replay_lag
FROM pg_stat_replication;

SELECT * FROM pg_replication_slots;
```

### On a replica

```sql
SELECT pg_is_in_recovery();   -- 't' when acting as a replica

SELECT pg_last_wal_receive_lsn() AS receive_lsn,
       pg_last_wal_replay_lsn()  AS replay_lsn,
       NOW() - pg_last_xact_replay_timestamp() AS replication_lag;
```

### Application health endpoint

```typescript
app.get('/health/database', async (req, res) => {
  const stats = db.stats();
  const status = stats.replicas.healthy > 0 ? 'healthy' : 'degraded';
  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    replicas: stats.replicas,
    timestamp: new Date().toISOString(),
  });
});
```

### Prometheus metrics

Export replica health and lag as gauges, and query distribution as counters, so
you can dashboard replica health, replication lag, and read/write split.

## Load balancing

- **Round robin (default):** each read goes to the next healthy replica.
- **Weighted:** configure per-replica weights in `POSTGRES_REPLICA_HOSTS`
  (`host:port:weight`) to send more traffic to larger replicas.

## Performance

- **Connection pooling:** the pool caps connections per node (e.g. 20 on the
  primary, 10 per replica). Tune to your database's `max_connections`.
- **Cache hot reads** in Redis and invalidate on write to reduce replica load.

```typescript
async function getCachedTools() {
  const cached = await redis.get('tools:all');
  if (cached) return JSON.parse(cached);
  const tools = await db.read.tool.findMany();
  await redis.setex('tools:all', 300, JSON.stringify(tools));
  return tools;
}
```

## Troubleshooting

**High replication lag.** Check network between primary and replica, inspect
primary load, raise `max_wal_senders` if needed, and look for long-running
queries on the primary.

**Replica marked unhealthy / all reads hit the primary.** Check the replica pod
and logs, verify the replication credentials, and test connectivity from the
replica to the primary.

**Replication slot issues (WAL accumulating on primary).** Inspect
`pg_replication_slots`; drop and recreate an inactive slot if a replica is gone
for good.

## Disaster recovery

### Promote a replica to primary

```bash
kubectl scale deployment veltrix-server --replicas=0 -n veltrix
kubectl exec -it postgres-replica-0 -n veltrix -- pg_ctl promote -D $PGDATA
psql -U postgres -d veltrix -c "SELECT pg_is_in_recovery();"   # expect 'f'
# Repoint the application to the new primary, then restart
kubectl scale deployment veltrix-server --replicas=3 -n veltrix
```

### Rebuild a failed replica

```bash
kubectl delete pod postgres-replica-1 -n veltrix
kubectl exec -it postgres-replica-1 -n veltrix -- bash -c 'rm -rf $PGDATA/*'
./scripts/setup-replication.sh --mode replica \
  --primary-host postgres-primary.veltrix.svc.cluster.local
```

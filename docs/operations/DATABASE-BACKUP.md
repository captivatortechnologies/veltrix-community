# Database Backup & Recovery

PostgreSQL backup, restore, point-in-time recovery, and disaster-recovery
procedures for a self-hosted Veltrix deployment.

> Commands below use placeholder values. Replace `<your-backup-bucket>`,
> `<your-backup-image>`, hostnames, and any credential with your own. Object
> storage (S3-compatible) and notification webhooks are **optional** — the core
> `pg_dump`/`pg_restore` workflow works entirely with local storage.

## Table of contents

- [Overview](#overview)
- [Backup strategy](#backup-strategy)
- [Automated backups](#automated-backups)
- [Manual backups](#manual-backups)
- [Restore procedures](#restore-procedures)
- [Point-in-time recovery](#point-in-time-recovery-pitr)
- [Disaster recovery](#disaster-recovery)
- [Monitoring & verification](#monitoring--verification)
- [Troubleshooting](#troubleshooting)

## Overview

A robust backup posture follows the 3-2-1 rule:

- **3** copies of data (production + 2 backups)
- **2** different storage media (e.g. local disk + object storage)
- **1** offsite copy

Backup types:

1. **Full backup** — complete database dump (daily).
2. **Incremental / differential** — changes since last backup (hourly).
3. **WAL archiving** — continuous archiving for point-in-time recovery.
4. **Schema backup** — structure only (before migrations).

Retention is a policy decision; a reasonable starting point is 30 days for full
backups locally and longer offsite, 7 days for incrementals, and 1 year for
schema snapshots.

## Backup strategy

### Suggested schedule

```
Daily:      Full backup at 02:00 UTC
Hourly:     Incremental at :15 past the hour
Continuous: WAL archiving (real-time)
Weekly:     Schema backup on Sunday 01:00 UTC
```

### Local storage layout

```
/var/backups/postgresql/
├── full/           # Full backups
├── incremental/    # Incremental backups
├── wal/            # WAL archives
├── schema/         # Schema backups
└── logs/           # Backup logs
```

## Automated backups

### Cron

```bash
crontab -e

# Full backup daily at 2 AM
0 2 * * * /app/scripts/backup-database.sh full >> /var/log/veltrix/backup.log 2>&1

# Incremental hourly at :15
15 * * * * /app/scripts/backup-database.sh incremental >> /var/log/veltrix/backup.log 2>&1

# Schema backup weekly (Sunday 1 AM)
0 1 * * 0 /app/scripts/backup-database.sh schema >> /var/log/veltrix/backup.log 2>&1

# Prune local backups older than 30 days, daily at 3 AM
0 3 * * * find /var/backups/postgresql -name "*.sql.gz" -mtime +30 -delete
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: veltrix
spec:
  schedule: "0 2 * * *"   # daily at 2 AM
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: <your-backup-image>:latest
            env:
            - name: POSTGRES_HOST
              value: "postgres.veltrix.svc.cluster.local"
            - name: POSTGRES_DB
              value: "veltrix"
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef: { name: postgres-credentials, key: username }
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef: { name: postgres-credentials, key: password }
            # Optional offsite target:
            - name: BACKUP_BUCKET
              value: "<your-backup-bucket>"
            volumeMounts:
            - name: backup-storage
              mountPath: /var/backups/postgresql
          volumes:
          - name: backup-storage
            persistentVolumeClaim: { claimName: backup-storage }
          restartPolicy: OnFailure
```

## Manual backups

### Full backup

```bash
# Default (local)
./scripts/backup-database.sh

# Custom retention / directory
RETENTION_DAYS=60 ./scripts/backup-database.sh
BACKUP_DIR=/custom/path ./scripts/backup-database.sh
```

### Schema only (before migrations)

```bash
pg_dump -h localhost -U postgres -d veltrix \
  --schema-only --no-owner --no-privileges \
  > schema_$(date +%Y%m%d).sql
```

### Selective tables

```bash
pg_dump -h localhost -U postgres -d veltrix \
  --table=deployments --table=tools --table=users \
  | gzip > critical_tables_$(date +%Y%m%d).sql.gz
```

### Optional: copy offsite

If you use S3-compatible object storage, upload after a successful dump:

```bash
aws s3 cp /var/backups/postgresql/veltrix_full_$(date +%Y%m%d).sql.gz \
  s3://<your-backup-bucket>/database/full/ --storage-class STANDARD_IA
```

## Restore procedures

### Interactive

```bash
./scripts/restore-database.sh          # select from available backups
```

### Direct

```bash
# Restore to a NEW database (safe)
BACKUP_FILE=/var/backups/postgresql/veltrix_full_20251124.sql.gz \
TARGET_DB=veltrix_restore \
./scripts/restore-database.sh

# Restore over production (DESTRUCTIVE)
BACKUP_FILE=/var/backups/postgresql/veltrix_full_20251124.sql.gz \
TARGET_DB=veltrix \
./scripts/restore-database.sh
```

### Production restore workflow

```bash
# 1. Stop application writes
kubectl scale deployment veltrix-server --replicas=0 -n veltrix

# 2. Back up current state first
./scripts/backup-database.sh

# 3. Restore into a temporary database
TARGET_DB=veltrix_temp \
BACKUP_FILE=/var/backups/postgresql/veltrix_full_20251124.sql.gz \
./scripts/restore-database.sh

# 4. Verify
psql -h localhost -U postgres -d veltrix_temp -c "SELECT COUNT(*) FROM deployments;"

# 5. Swap databases
psql -h localhost -U postgres <<'EOF'
ALTER DATABASE veltrix RENAME TO veltrix_old;
ALTER DATABASE veltrix_temp RENAME TO veltrix;
EOF

# 6. Restart the application
kubectl scale deployment veltrix-server --replicas=3 -n veltrix

# 7. Once confirmed healthy, drop the old database
psql -h localhost -U postgres -c "DROP DATABASE veltrix_old;"
```

## Point-in-time recovery (PITR)

### Enable WAL archiving (`postgresql.conf`)

```conf
wal_level = replica
archive_mode = on
archive_command = '/app/scripts/archive-wal.sh %p %f'
archive_timeout = 300           # 5 minutes

checkpoint_timeout = 15min
max_wal_size = 1GB
min_wal_size = 80MB
```

### WAL archive script (local, with optional offsite)

```bash
#!/bin/bash
# archive-wal.sh — archive a WAL file
WAL_FILE=$1
WAL_NAME=$2

cp "$WAL_FILE" "/var/backups/postgresql/wal/$WAL_NAME"

# Optional: copy offsite
if [ -n "$BACKUP_BUCKET" ]; then
  aws s3 cp "/var/backups/postgresql/wal/$WAL_NAME" \
    "s3://${BACKUP_BUCKET}/database/wal/$WAL_NAME" --storage-class STANDARD_IA
fi
```

### PITR restore

```bash
systemctl stop postgresql
mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.old

# Restore base backup, then configure recovery to a target time
cat > /var/lib/postgresql/16/main/recovery.signal <<'EOF'
EOF
# In postgresql.auto.conf (PostgreSQL 12+):
#   restore_command = 'cp /var/backups/postgresql/wal/%f %p'
#   recovery_target_time = '2025-11-24 14:30:00'
#   recovery_target_action = 'promote'

systemctl start postgresql   # replays WAL up to the target time
```

## Disaster recovery

Define your targets, for example:

- **RTO** (recovery time objective): 1 hour
- **RPO** (recovery point objective): 5 minutes (with WAL archiving)

### Scenario: database corruption

```bash
kubectl scale deployment veltrix-server --replicas=0 -n veltrix
./scripts/restore-database.sh
psql -h localhost -U postgres -d veltrix_restore -c "SELECT COUNT(*) FROM deployments;"
psql -h localhost -U postgres <<'EOF'
ALTER DATABASE veltrix RENAME TO veltrix_corrupted;
ALTER DATABASE veltrix_restore RENAME TO veltrix;
EOF
kubectl scale deployment veltrix-server --replicas=3 -n veltrix
```

### Scenario: accidental data deletion

```bash
# 1. Stop writes immediately
kubectl scale deployment veltrix-server --replicas=0 -n veltrix

# 2. Restore the affected table into a recovery database
RESTORE_TYPE=selective TABLES="deployments" \
BACKUP_FILE=/var/backups/postgresql/veltrix_full_20251124_120000.sql.gz \
TARGET_DB=veltrix_recovery \
./scripts/restore-database.sh

# 3. Export recovered rows and import into production
pg_dump -h localhost -U postgres -d veltrix_recovery --table=deployments --data-only \
  > deployments_recovered.sql
psql -h localhost -U postgres -d veltrix < deployments_recovered.sql

# 4. Restart the application
kubectl scale deployment veltrix-server --replicas=3 -n veltrix
```

## Monitoring & verification

### Verify a backup

```bash
LATEST=$(ls -t /var/backups/postgresql/veltrix_full_*.sql.gz | head -1)

# Integrity of the archive
gzip -t "$LATEST" && echo "OK" || echo "CORRUPTED"

# Test restore into a throwaway database, then validate row counts
TEST_DB="veltrix_verify_$(date +%s)"
gunzip -c "$LATEST" | pg_restore -d postgres -C --dbname="$TEST_DB"
psql -h localhost -U postgres -d "$TEST_DB" -c "SELECT COUNT(*) FROM deployments;"
psql -h localhost -U postgres -c "DROP DATABASE $TEST_DB;"
```

### Prometheus alerting (example rules)

```yaml
groups:
  - name: backup-alerts
    rules:
      - alert: BackupFailed
        expr: time() - backup_last_success_timestamp > 86400
        for: 1h
        labels: { severity: critical }
        annotations: { summary: "No successful database backup in 24 hours" }

      - alert: LowBackupDiskSpace
        expr: node_filesystem_avail_bytes{mountpoint="/var/backups"} / node_filesystem_size_bytes < 0.1
        for: 15m
        labels: { severity: warning }
        annotations: { summary: "Backup disk space below 10%" }
```

## Troubleshooting

**Backup fails with "disk full".** Check `df -h /var/backups/postgresql`, prune
old backups, and compress any uncompressed dumps.

**Restore fails with permission error.** Ensure the restoring role has the needed
privileges on the target database.

**Backup times out on a large database.** Raise the statement timeout and use a
parallel dump: `pg_dump -j 4 ...`.

**WAL archive directory filling up.** Confirm archiving is keeping up, prune old
WAL files, and review `archive_timeout`.

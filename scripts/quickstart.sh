#!/usr/bin/env bash
# Veltrix Community Edition — one-command self-host bootstrap.
#
#   ./scripts/quickstart.sh
#
# Creates a .env (with freshly generated secrets) if one doesn't exist, builds
# the images, brings up Postgres + Redis, applies migrations, then starts the
# app — which auto-seeds the default organization + admin on first boot.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' is required but not installed." >&2; exit 1; }; }
need docker
docker compose version >/dev/null 2>&1 || { echo "error: 'docker compose' (v2) is required." >&2; exit 1; }

gen() { openssl rand -hex 32 2>/dev/null || head -c32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example with generated secrets"
  cp .env.example .env
  ADMIN_PW="Admin-$(openssl rand -hex 6 2>/dev/null || echo changeme123)"
  # Fill required secrets (portable in-place sed for GNU and BSD)
  for kv in \
    "JWT_SECRET=$(gen)" \
    "JWT_REFRESH_SECRET=$(gen)" \
    "ENCRYPTION_KEY=$(gen)" \
    "COOKIE_SECRET=$(gen)" \
    "VELTRIX_ADMIN_PASSWORD=$ADMIN_PW" ; do
    key=${kv%%=*}; val=${kv#*=}
    sed -i.bak -E "s|^${key}=.*|${key}=${val}|" .env && rm -f .env.bak
  done
  echo "    Admin login will be: admin@example.com / ${ADMIN_PW}"
  echo "    (stored in .env — change the password after first login)"
else
  echo "==> Reusing existing .env"
fi

echo "==> Building images"
docker compose build server client

echo "==> Starting datastores"
docker compose up -d db redis

echo "==> Waiting for Postgres to be healthy"
for _ in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' veltrix-community-db-1 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done

echo "==> Applying database migrations"
docker compose run --rm --no-deps server npx prisma migrate deploy

echo "==> Starting the application (auto-seeds on first boot)"
docker compose up -d server client

cat <<'DONE'

==> Veltrix Community Edition is starting.

    Web UI:   http://localhost:3000
    API:      http://localhost:5000

    Check status:  docker compose ps
    Follow logs:   docker compose logs -f server
    Stop:          docker compose down    (add -v to wipe data)

DONE

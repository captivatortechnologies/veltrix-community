# Quickstart — Self-Host in 5 Minutes

This guide gets a single-server Veltrix Community Edition running on your own
machine with Docker. Everything runs in four containers: PostgreSQL, Redis, the
backend (Fastify), and the frontend (React). There is no message broker to
install — pipeline jobs run on BullMQ, which uses Redis.

## Prerequisites

- **Docker** and **Docker Compose** (a recent version)
- **git**
- A way to generate random secrets, e.g. `openssl` (Linux/macOS) or any 32-byte
  hex generator

That's it. You do not need Node.js or pnpm just to run the stack.

---

## 1. Get the code

```bash
git clone https://github.com/<your-fork-or-org>/veltrix-community.git
cd veltrix-community
```

## 2. Create your `.env`

```bash
cp .env.example .env
```

Open `.env` in an editor. The server **fails fast** at startup if any required
secret is missing, so these must be set to real values (not the `CHANGE_ME`
placeholders).

## 3. Generate secrets

Generate four independent 32-byte secrets and a database password:

```bash
# Run this four times, pasting each value into .env
openssl rand -hex 32
```

Set in `.env`:

| Variable | What it is |
|---|---|
| `JWT_SECRET` | Signs access tokens |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (use a *different* value) |
| `ENCRYPTION_KEY` | AES-256 key for encrypting stored credentials |
| `COOKIE_SECRET` | Signs session cookies |
| `POSTGRES_PASSWORD` | Password for the bundled PostgreSQL (also update it inside `DATABASE_URL`) |
| `VELTRIX_ADMIN_EMAIL` | Email for the first-run administrator account |

Leave `VELTRIX_ADMIN_PASSWORD` **blank** to have a strong random password
generated for you (it is printed once to the server log in the next step), or set
your own.

> Tip: generate all four secrets at once and eyeball them into `.env`:
>
> ```bash
> for k in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY COOKIE_SECRET; do
>   echo "$k=$(openssl rand -hex 32)"
> done
> ```

The pipeline features (`FEATURE_PIPELINE_*`) are already enabled by default and
are free. The commercial flags (`FEATURE_BILLING`, `FEATURE_MULTI_TENANT`) are
off and are not part of the Community Edition — leave them `false`.

> These are the *install-time* secrets. Others — email/SMTP, SSO, integration
> credentials — are configured later in the admin UI and stored encrypted. See
> [`SECRETS.md`](./SECRETS.md) for the full picture.

## 4. Start the stack

```bash
docker compose up -d --build
```

This builds and starts `db`, `redis`, `server`, and `client`. The first build
takes a few minutes; subsequent starts are fast.

## 5. Apply the database schema

Apply the Prisma migrations to the running database:

```bash
docker compose exec server npx prisma migrate deploy
```

(For a non-Docker dev setup, the repository provides the convenience script
`pnpm db:migrate`.)

On first boot the server seeds a default organization and creates the first-run
administrator from `VELTRIX_ADMIN_EMAIL`.

## 6. Log in

Open **http://localhost:8730**.

- **Email:** the `VELTRIX_ADMIN_EMAIL` you set.
- **Password:** the `VELTRIX_ADMIN_PASSWORD` you set — or, if you left it blank,
  find the one-time generated password in the server log:

  ```bash
  docker compose logs server | grep -i "admin password"
  ```

Change the password immediately after your first login.

You now have a working Veltrix instance: create environments, define
configuration on the canvas, and (once you install an app) run configuration
through the pipeline.

---

## Everyday commands

```bash
docker compose ps                 # service status
docker compose logs -f server     # tail backend logs
docker compose down               # stop the stack (keeps data volumes)
docker compose down -v            # stop and delete all data (fresh start)
```

## Default ports

| Service | URL / Port |
|---|---|
| Frontend | http://localhost:8730 |
| Backend API | http://localhost:8731 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## Troubleshooting

- **Server exits immediately on startup.** A required secret is unset. Check
  `docker compose logs server` — it names the missing variable. Fill it in `.env`
  and `docker compose up -d` again.
- **Cannot connect to the database.** Ensure `POSTGRES_PASSWORD` matches the
  password embedded in `DATABASE_URL`. The bundled Compose file wires these for
  you when you set `POSTGRES_PASSWORD`.
- **Port already in use.** Something else is bound to 3000/5000/5432/6379. Stop
  the conflicting process or change the published port in `docker-compose.yml`.
- **Forgot the generated admin password.** It is only printed once. The simplest
  reset during evaluation is `docker compose down -v` (this wipes all data) and
  start over with an explicit `VELTRIX_ADMIN_PASSWORD`.

## Next steps

- [Configuration reference](./CONFIGURATION.md) — every environment variable
  explained, including optional SSO.
- [Architecture](./ARCHITECTURE.md) — how the pipeline and app engine fit
  together.
- [App authoring](./APP_AUTHORING.md) — build an integration that plugs into the
  pipeline.
- [Operations guides](./operations/) — production concerns: CI/CD, backups,
  observability, and read replicas.

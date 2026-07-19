# Running Veltrix as a systemd service

`veltrix.service` manages the Docker Compose stack (Postgres, Redis, API, web) as
a single systemd unit, so the stack starts on boot and can be controlled with the
usual `systemctl start` / `stop` / `restart` commands.

> This wraps the [Docker Compose](../../docker-compose.yml) deployment. Docker
> Engine + the Compose v2 plugin must already be installed.

## Install

1. **Put the project where the unit expects it** (or edit `WorkingDirectory` in
   the unit file). The default is `/opt/veltrix`:

   ```bash
   sudo git clone https://github.com/captivatortechnologies/veltrix-community.git /opt/veltrix
   cd /opt/veltrix
   ```

2. **Do the one-time setup** — create `.env`, build the images, migrate, and
   verify it boots. The quickstart does all of this:

   ```bash
   sudo ./scripts/quickstart.sh
   ```

   (Or do it by hand: `cp .env.example .env` and fill in the secrets, then
   `docker compose build` and `docker compose run --rm --no-deps server npx prisma migrate deploy`.)

3. **Install and enable the service:**

   ```bash
   sudo cp deploy/systemd/veltrix.service /etc/systemd/system/veltrix.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now veltrix
   ```

   `--now` starts it immediately; `enable` makes it start on boot.

## Control

```bash
sudo systemctl start veltrix      # bring the stack up
sudo systemctl stop veltrix       # take it down (data volumes are kept)
sudo systemctl restart veltrix
sudo systemctl status veltrix     # unit status
```

Container logs are still viewed through Compose:

```bash
cd /opt/veltrix && docker compose logs -f server
```

Once running, the web UI is on **http://localhost:8730** and the API on
**http://localhost:8731** (see [docker-compose.yml](../../docker-compose.yml)).

## Upgrading

After pulling new code, rebuild, apply any new migrations, and restart:

```bash
cd /opt/veltrix
git pull
docker compose build
docker compose run --rm --no-deps server npx prisma migrate deploy
sudo systemctl restart veltrix
```

## Uninstall

```bash
sudo systemctl disable --now veltrix
sudo rm /etc/systemd/system/veltrix.service
sudo systemctl daemon-reload
# Optionally remove the stack and its data:
cd /opt/veltrix && docker compose down -v
```

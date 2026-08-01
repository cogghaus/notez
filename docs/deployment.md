# Deployment Guide

Notez runs as a single Docker image (backend API + frontend) with PostgreSQL and MinIO.

## Prerequisites

- Docker Engine 24+ with Compose v2
- A domain with HTTPS (reverse proxy like Caddy, Traefik, or Cloudflare Tunnel)
- ~512 MB RAM, 1 CPU core

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/cogghaus/notez.git
cd notez
cp .env.example .env
```

Edit `.env` and fill in all required values. Generate secrets with:

```bash
openssl rand -base64 32
```

### 2. Create data directories

```bash
mkdir -p /opt/notez/data/postgres /opt/notez/data/minio
```

Or set `DATA_DIR` in `.env` to a different path.

### 3. Log in to GHCR

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

You need a GitHub Personal Access Token with `read:packages` scope.

### 4. Start

```bash
docker compose -f compose.prod.yml -p notez up -d
```

The app will be available on port `5173`. Point your reverse proxy at it.

### 5. First-time setup

Open the app in your browser. You'll be prompted to create an admin account on first boot.

## Auto-Update (optional)

Pull and restart on a schedule with cron:

```bash
crontab -e
```

Add:

```
*/5 * * * * cd /path/to/notez && docker compose -f compose.prod.yml -p notez pull notez-backend -q && docker compose -f compose.prod.yml -p notez up -d notez-backend 2>&1 | logger -t notez-deploy
```

This checks for new images every 5 minutes and restarts only if the image changed.

## Stopping

```bash
docker compose -f compose.prod.yml -p notez down
```

Data is preserved in the bind-mount volumes. To remove data as well, delete the `DATA_DIR` directories.

## Troubleshooting

**Container won't start?** Check logs:

```bash
docker logs notez-backend
docker logs notez-db
```

**Database migration errors?** Migrations run automatically on startup via `docker-entrypoint.sh`. If a migration fails, check `notez-backend` logs for the specific error.

**Port conflict?** Change the host port in `compose.prod.yml` (e.g., `8080:3000` instead of `5173:3000`).

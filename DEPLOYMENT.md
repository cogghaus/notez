# Notez Deployment Guide

Complete guide for deploying Notez with Docker.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Compose files](#compose-files)
- [Quick Start (local)](#quick-start-local)
- [Production Deployment](#production-deployment)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Updating](#updating)
- [Backup and Restore](#backup-and-restore)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Docker 20.10 or later
- Docker Compose v2 (invoked as `docker compose`, not `docker-compose`)
- PostgreSQL 16 and MinIO (both included in the compose files)

---

## Compose files

The repository ships four compose files. Pick the one that matches what you are doing.

| File | Purpose | Images | Ports |
|------|---------|--------|-------|
| `compose.yml` | Local development with hot reload | Builds `backend/Dockerfile` + `frontend/Dockerfile.dev` | API `3000`, UI `5173` |
| `compose.local.yml` | Testing the production Dockerfiles against an existing Postgres/MinIO | Builds `backend/Dockerfile` + `frontend/Dockerfile` | UI `5173` |
| `compose.prod.yml` | Production | Pulls `ghcr.io/cogghaus/notez:main` | `5173` → container `3000` |
| `compose.test.yml` | CI / integration tests | Builds | — |

In production the backend serves the built frontend as static files, so there is a
single application container rather than separate API and UI containers. It listens
on port **3000 inside the container**; `compose.prod.yml` publishes that on host
port **5173**.

---

## Quick Start (local)

The fastest way to get a full stack running:

### 1. Clone the repository

```bash
git clone https://github.com/cogghaus/notez.git
cd notez
```

### 2. Start the development stack

```bash
docker compose up -d
```

This brings up PostgreSQL, MinIO, the backend, and the Vite dev server with the
default development credentials baked into `compose.yml`. Migrations run
automatically on backend start.

### 3. Access Notez

Open **http://localhost:5173**.

On first access you'll be prompted to create an admin account through the setup
wizard.

> The credentials in `compose.yml` are development defaults and are not safe for
> anything reachable from a network. For a real deployment use `compose.prod.yml`
> and follow the next section.

---

## Production Deployment

### 1. Create an environment file

```bash
cp .env.example .env
```

### 2. Generate secure secrets

**Linux / macOS:**
```bash
openssl rand -base64 32
```

**Windows (PowerShell):**
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Generate a separate value for each of:

- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY` (must be at least 32 characters)
- `MINIO_SECRET_KEY`
- `COOKIE_SECRET` (optional — falls back to `JWT_REFRESH_SECRET`)

Then set `APP_URL` and `CORS_ORIGIN` to your public URL, and `DATA_DIR` to the host
directory that will hold persistent data.

`compose.prod.yml` fails fast with an explanatory error if any required secret is
missing, rather than starting with an insecure default.

### 3. Prepare the data directories

The Postgres and MinIO volumes are bind mounts, so the host directories must exist
before the first start:

```bash
mkdir -p "${DATA_DIR:-/opt/notez}/data/postgres"
mkdir -p "${DATA_DIR:-/opt/notez}/data/minio"
```

### 4. Create the external network

`compose.prod.yml` attaches the backend to an external network named
`apps-internal` so a reverse proxy running in a different stack can reach it. Create
it once:

```bash
docker network create apps-internal
```

If you are not fronting Notez with a separate reverse proxy stack, remove the
`apps-internal` entries from the `networks:` blocks in `compose.prod.yml` instead.

### 5. Deploy

```bash
docker compose -f compose.prod.yml up -d
```

Migrations run automatically via `docker-entrypoint.sh` before the app starts.

### 6. Verify

```bash
docker compose -f compose.prod.yml ps
curl http://localhost:5173/health
```

A healthy deployment returns `{"status":"ok","database":"connected"}`. If the
database is unreachable the endpoint returns HTTP 503, which is what the
container's `HEALTHCHECK` uses to mark the container unhealthy.

### Building from source instead of pulling

```bash
docker build -t notez:local .
```

Then change the `image:` line for `notez-backend` in `compose.prod.yml` to
`notez:local` and remove `pull_policy: always`.

### Running behind a reverse proxy

The backend sets `trustProxy`, so `X-Forwarded-*` headers are honoured for client
IP resolution and rate limiting. Set `APP_URL` and `CORS_ORIGIN` to the external
HTTPS URL, not the internal host and port.

---

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | `<random>` |
| `JWT_ACCESS_SECRET` | Access token signing secret | `<random>` |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | `<random>` |
| `ENCRYPTION_KEY` | Encrypts stored AI API keys and webhook secrets (32+ chars) | `<random>` |
| `MINIO_SECRET_KEY` | MinIO root password | `<random>` |

### Required in production

| Variable | Description | Example |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed browser origin | `https://notez.example.com` |
| `APP_URL` | Public URL of the application | `https://notez.example.com` |

The backend refuses to start in production without `CORS_ORIGIN`.

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port inside the container | `3000` |
| `HOST` | Bind address | `0.0.0.0` |
| `LOG_LEVEL` | Log level | `info` |
| `COOKIE_SECRET` | Cookie signing secret | falls back to `JWT_REFRESH_SECRET` |
| `DATA_DIR` | Host directory for persistent data | `/opt/notez` |
| `RESEND_API_KEY` | Enables password reset emails | unset (feature disabled) |
| `EMAIL_FROM` | From address for outbound mail | `noreply@example.com` |
| `MINIO_BUCKET` | Bucket for uploaded images | `notez-images` |
| `MCP_REMOTE_ENABLED` | Enables the OAuth 2.1 remote MCP connector at `/mcp` | `false` |
| `MCP_ALLOWED_ORIGINS` | Allowed origins for the MCP transport | `https://claude.ai,https://www.claude.ai` |
| `OTEL_SDK_DISABLED` | Disables OpenTelemetry export | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint | `http://otel-collector:4318` |

Setting `MCP_REMOTE_ENABLED=true` requires `APP_URL` to be set, since it is
published in the OAuth metadata document. Note that `/mcp` keeps sessions in
memory, so that deployment cannot be scaled horizontally without an external
session store.

If no OTLP collector is reachable, set `OTEL_SDK_DISABLED=true` to avoid repeated
export failures in the logs.

### Security notes

1. Generate unique secrets per deployment, and different secrets per environment.
2. Never commit `.env` — it is already gitignored.
3. Rotating `JWT_REFRESH_SECRET` or `ENCRYPTION_KEY` signs every user out.
   Rotating `ENCRYPTION_KEY` also makes stored AI keys and webhook secrets
   undecryptable, so they must be re-entered.

---

## Database Migrations

Migrations run automatically when the container starts, via
`docker-entrypoint.sh`, before the application process launches. If a migration
fails the container exits rather than serving traffic against a stale schema.

To run them manually:

```bash
docker exec -it notez-backend sh -c "cd /app/backend && npx prisma migrate deploy"
```

Check migration status:

```bash
docker exec -it notez-backend sh -c "cd /app/backend && npx prisma migrate status"
```

---

## Updating

```bash
# Pull the newest published image
docker compose -f compose.prod.yml pull

# Recreate with the new image (migrations run on start)
docker compose -f compose.prod.yml up -d

# Follow the logs
docker compose -f compose.prod.yml logs -f notez-backend
```

Take a database backup before updating if the release includes migrations —
`prisma migrate deploy` does not roll back.

---

## Backup and Restore

Container names are set explicitly in `compose.prod.yml`: `notez-backend`,
`notez-db`, and `notez-minio`.

### Backup the database

```bash
docker exec notez-db pg_dump -U notez notez > notez-backup-$(date +%Y%m%d).sql
```

### Restore the database

```bash
docker exec -i notez-db psql -U notez notez < notez-backup.sql
```

### Backup uploaded images

Uploaded images live in MinIO, not in Postgres, so a database dump alone is not a
complete backup. Back up `${DATA_DIR}/data/minio` as well.

### Automated backups

```bash
0 2 * * * docker exec notez-db pg_dump -U notez notez | gzip > /backups/notez-$(date +\%Y\%m\%d).sql.gz
```

---

## Troubleshooting

### Container won't start

```bash
docker logs notez-backend
```

Common causes:

- A required secret is unset — the container reports which one and exits.
- `CORS_ORIGIN` missing while `NODE_ENV=production`.
- The `DATA_DIR` bind mount directories do not exist on the host.
- The external `apps-internal` network has not been created.

### `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory`

The entrypoint script was checked out with CRLF line endings, so the container
looks for an interpreter named `/bin/sh\r`. This affects Windows clones made
before `.gitattributes` was added. Fix an existing clone with:

```bash
git rm --cached -r .
git reset --hard
```

Then rebuild the image.

### Database connection failed

```bash
docker ps --filter name=notez-db
docker exec -it notez-db psql -U notez -d notez -c "SELECT 1"
```

Check that `POSTGRES_PASSWORD` in `.env` matches what the database was
*initialised* with. Changing it after the first start does not change the existing
password — the Postgres image only applies it when the data directory is empty.

### Can't access the application

```bash
docker ps --filter name=notez-backend
docker port notez-backend
docker inspect notez-backend --format '{{json .State.Health}}'
```

Remember the published port is **5173**, mapping to **3000** inside the container.

### Health check failing

```bash
curl -i http://localhost:5173/health
```

HTTP 503 with `{"status":"error","database":"disconnected"}` means the app is up
but cannot reach Postgres.

### Image uploads fail

Check that MinIO is healthy and that `MINIO_SECRET_KEY` matches on both services.
The backend logs `⚠️ MinIO storage not available` at startup when it cannot reach
the bucket; the app still serves everything except image uploads.

### Performance issues

```bash
docker stats notez-backend notez-db
docker exec -it notez-db psql -U notez -d notez -c "SELECT * FROM pg_stat_activity"
```

---

## Additional Resources

- **GitHub Repository:** https://github.com/cogghaus/notez
- **Issues:** https://github.com/cogghaus/notez/issues
- **Container Images:** https://ghcr.io/cogghaus/notez

---

## Support

If you encounter issues:

1. **Check logs:** `docker logs notez-backend`
2. **Review this guide** thoroughly
3. **Search existing issues** on GitHub
4. **Create a new issue** with:
   - Docker version
   - Error logs
   - Environment details (redact secrets!)
   - Steps to reproduce

---

**Happy note-taking! 📝**

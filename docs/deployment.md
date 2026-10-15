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
openssl rand -hex 32
```

(Hex, not base64: `POSTGRES_PASSWORD` is embedded in `DATABASE_URL`, where `/` and `+` break.)

### 2. Create data directories

```bash
mkdir -p /opt/notez/data/postgres /opt/notez/data/minio
```

Or set `DATA_DIR` in `.env` to a different path, or `POSTGRES_DATA_DIR` / `MINIO_DATA_DIR` to
place either one anywhere (for an existing install with a different layout).

### 3. Log in to GHCR

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

You need a GitHub Personal Access Token with `read:packages` scope.

### 4. Start

```bash
docker compose -f compose.prod.yml -p notez up -d
```

The app will be available on port `5173` (IPv4). Point your reverse proxy at it.

### Reverse proxy and TRUST_PROXY

Rate limits are keyed on the client address, and Pocket ID sign-in checks which host name the
request came in on. Behind a proxy both come from `X-Forwarded-For` / `X-Forwarded-Host`, which
anyone can send, so the backend only believes them from the peers in `TRUST_PROXY`.

- Default `loopback,172.16.0.0/12`: a proxy on the same machine, or a proxy or tunnel container
  on the same Docker host (Docker's default bridge range). A client that reaches port `5173`
  directly from the LAN keeps its own address and cannot forge either header.
- Your proxy runs elsewhere (another LAN host): set `TRUST_PROXY` to its address, e.g.
  `TRUST_PROXY=192.168.1.10`.
- Nothing but the proxy can reach the backend: `TRUST_PROXY=true` (trust every peer).
- No proxy at all: `TRUST_PROXY=false`.

An invalid value stops the backend at startup. The startup log line "Forwarded headers trusted
from these peers only" shows the value in effect.

The port is published on IPv4 only (`0.0.0.0:5173:3000`). Docker relays IPv6 connections to a
published port through its userland proxy, so they reach the backend from the Docker gateway
address, which is a trusted peer; publishing on IPv6 as well would let any IPv6 client forge the
forwarded headers.

### 5. First-time setup

Open the app in your browser. You'll be prompted to create an admin account on first boot.

## Single sign-on (Pocket ID)

Optional. Adds a "Sign in with Pocket ID" button next to the password form; password login keeps
working (and is still how service accounts and anyone without a Pocket ID account sign in).

1. In Pocket ID, create a confidential client (PKCE on) with redirect URI
   `${APP_URL}/api/auth/oidc/callback` and logout URL `${APP_URL}/`. Restrict it to a group
   (cogg.haus: group `notez_users`). **Group membership is the access gate**: anyone in the group
   can sign in, and gets an account created on first sign-in if they have none.
2. Set in the server environment, then recreate `notez-backend`:
   - `OIDC_ISSUER`: the issuer exactly as the provider publishes it (cogg.haus: `https://id.cogg.haus`)
   - `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (cogg.haus: Infisical `oidc/NOTEZ_POCKET_OIDC_CLIENT_ID`,
     `oidc/NOTEZ_POCKET_OIDC_CLIENT_SECRET`)
   - `OIDC_REQUIRED_GROUP` (optional, recommended): the group name to require in the ID token's
     `groups` claim, checked server-side as well as by the provider (cogg.haus: `notez_users`)
   - `APP_URL` must already be the public URL
3. The container must be able to reach the issuer over HTTPS (discovery and token exchange).
4. **Before telling users about it**, make each existing user's Notez email match their Pocket ID
   email. A mismatch is not an error: their first Pocket ID sign-in silently creates a new, empty
   account, and undoing that needs SQL (`UPDATE users SET oidc_subject = NULL WHERE ...`) until an
   admin unlink exists (known issue #62).

How accounts are matched:
- First sign-in links to the existing **regular** Notez account with the same **verified** email
  (case-insensitive) and records the provider's subject id. Later sign-ins match on the subject
  id only, so changing the email in Pocket ID does not break or move the link.
- **Admin accounts are never linked by email.** An admin signs in with their password once and
  uses Settings, Profile, "Sign in with Pocket ID", Connect. (Otherwise a group member who changed
  their Pocket ID email to the admin's could inherit the admin account on first sign-in.) Connect
  only completes when the same signed-in user confirms it on return, so an abandoned Connect on a
  shared browser cannot be finished by someone else.
- No matching account: a regular (non-admin) user is created, username taken from the Pocket ID
  username. Admin rights are never granted through SSO.
- Refused: service accounts, deactivated accounts, an account already linked to a different
  Pocket ID user, and identities without a verified email.

Removing someone's access: take them out of the Pocket ID group **and** deactivate them in Notez.
Pocket ID does not revoke existing Notez sessions, and a user who set a Notez password can still
use it.

Local development: SSO redirects back to relative `/login` paths, so set `APP_URL` to the Vite
origin (`http://localhost:5173`, which proxies `/api`) and register
`http://localhost:5173/api/auth/oidc/callback` on a separate dev client.

## Secrets

The secrets the server needs (all set in `.env`, which must be mode 600 and never committed):

| Variable | Purpose | Rotation trap |
|---|---|---|
| `POSTGRES_PASSWORD` | database role password; also inside `DATABASE_URL` | the DB keeps the old password: needs `ALTER ROLE` |
| `JWT_ACCESS_SECRET` | signs 1-hour access tokens | clients refresh; no sign-out expected |
| `JWT_REFRESH_SECRET` | signs 7-day refresh tokens | signs everyone out |
| `COOKIE_SECRET` | signs the refresh cookie and SSO cookies (defaults to `JWT_REFRESH_SECRET`) | signs everyone out |
| `ENCRYPTION_KEY` | encrypts stored AI provider keys and webhook secrets (first 32 characters used) | stored values become unreadable without re-encryption |
| `MINIO_SECRET_KEY` | MinIO root password and the backend's S3 secret | restart MinIO and backend together |
| `RESEND_API_KEY` | password-reset mail (optional) | revoke the old key at Resend |
| `OIDC_CLIENT_SECRET` | Pocket ID client secret (optional) | none for users; deactivate the old secret at the provider |

Generate values with `openssl rand -hex 32` (64 characters); alphanumeric keeps them safe in an
env file, a shell and the database URL.

**cogg.haus deployment (accserver).** Infisical is the source of truth since 2026-10-11 (project
`homelab`, env `prod`): `infra/NOTEZ_*` for the six app secrets, `external/NOTEZ_RESEND_API_KEY`,
`oidc/NOTEZ_POCKET_OIDC_*`. The server `.env` is generated from Infisical plus a committed file
of plain values, never edited by hand. The generator, the fingerprint drift check, the mapping and
the stack notes live in homelab-docs `servers/accserver/stacks/notez/`. The server is meant to
run this repo's `compose.prod.yml` unmodified, with host-specific values in that plain-values
file (switch-over from its old hand-edited copy follows the v1.30.3 merge; the stack README
tracks it).

**Rotating:** follow [runbooks/secret-rotation.md](runbooks/secret-rotation.md). Every secret
has an app-side trap (above), and on a host with the auto-update cron below, installing a changed
`.env` is itself a deploy: compose recreates `notez-backend` on the next run.

**Backups contain the `.env`.** The cogg.haus nightly backup copies it into the archive (mode
600); treat backup archives as secret-bearing.

## Auto-Update (optional)

Pull and restart on a schedule with cron:

```bash
crontab -e
```

Add:

```
*/5 * * * * cd /path/to/notez && docker compose -f compose.prod.yml -p notez pull notez-backend -q && docker compose -f compose.prod.yml -p notez up -d notez-backend 2>&1 | logger -t notez-deploy
```

This checks for new images every 5 minutes and recreates the backend only if the image or its
resolved configuration (`compose.prod.yml` or `.env`) changed.

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

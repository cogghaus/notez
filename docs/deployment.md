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

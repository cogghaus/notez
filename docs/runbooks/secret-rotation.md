# Secret rotation runbook (Notez on accserver)

Per-secret procedure for rotating the nine values in `/datapool/docker/notez/.env`. Written
2026-10-11 when the secrets moved into Infisical; **nothing has been rotated with it yet**, so
the first run of each section is also its test. Read the whole section before starting.

Where things live:

- Infisical (project `homelab`, env `prod`) is the source of truth. Mapping, regeneration and the
  drift check: homelab-docs `servers/accserver/stacks/notez/` (`infisical.map`, `install-env.sh`,
  `fingerprints.ps1`, `drift-check.sh`, `README.md`).
- Writes go through the secret-broker only: `secrets_set_random` for values we choose,
  `secrets_set_from_file` for values another service mints. No value ever goes in a tool argument,
  a command line or chat. Compare by 12-char fingerprint (`envkeys` on accserver).

## Rules that apply to every rotation

1. **Installing a changed `.env` deploys it.** The `*/5` deploy cron runs
   `up -d notez-backend`; compose recreates the backend on any resolved-config change, so the new
   value is live within 5 minutes whether you restart or not. The cron never recreates
   `notez-db` or `notez-minio`. Plan the order around that. Where a section says **pause the
   cron**, comment out the `notez-deploy` line in adam's crontab on accserver (`crontab -e`)
   before `--apply` and restore it after the final `up -d`; "being quick" is not a guard. (A
   standing pause switch, e.g. the cron line checking for a `.deploy-paused` file, is a proposed
   improvement, not in place.)
2. **Done means the OLD value is proven dead,** with a control that shows the test can fail. An
   assumed revocation has been wrong before (homelab change checklist, section 8).
3. **Old values outlive the rotation in backups.** `.env.prev` (kept by `install-env.sh`), the
   nightly `/datapool/backups/notez/*.tar.gz` (30 days) and the restic tiers (months) all hold
   the old `.env`. That is acceptable only because step 2 kills the old value. After a
   verified rotation, `shred -u /datapool/docker/notez/.env.prev`.
4. Change one secret (or one coupled pair) per window, then run the drift check: every key `ok`.
   The drift check proves the files and that the running backend was created from them (config
   hash); it does not prove the new value works or the old one is dead. The per-section
   "prove" steps are the done signal.
5. Local and server temp copies are removed with `shred -u`, but `/datapool` is ZFS
   (copy-on-write) and small files on ACCHOME's NTFS live in the MFT, so overwriting is best
   effort: treat it as a mode-600 delete, not destruction. Another reason rule 2 matters.
6. Generate with `charset: alnum`. The values pass through an env file, a shell and (for
   `POSTGRES_PASSWORD`) a URL; symbols break all three.

## Blast radius at a glance

| Secret | What breaks if it changes without the steps below | Users notice |
|---|---|---|
| `ENCRYPTION_KEY` | every stored AI provider key and webhook signing secret becomes undecryptable | AI features fail; webhooks fail, then auto-disable |
| `POSTGRES_PASSWORD` | backend cannot open new DB connections; the DB itself keeps the old password | app down |
| `JWT_REFRESH_SECRET` | every refresh token is invalid | everyone is signed out |
| `COOKIE_SECRET` | refresh cookie and SSO cookies fail their signature check | everyone is signed out; SSO logins in flight fail |
| `JWT_ACCESS_SECRET` | every access token (1 h) is invalid | brief re-auth via refresh, no sign-out expected |
| `MINIO_SECRET_KEY` | backend and MinIO disagree until both restart | image upload and display fail |
| `RESEND_API_KEY` | password-reset mail fails | only someone resetting a password |
| `OIDC_CLIENT_SECRET` | Pocket ID sign-in fails (password login unaffected) | SSO users |
| `OIDC_CLIENT_ID` | not rotated; only changes if the Pocket ID client is recreated | |

Unaffected by every rotation here: Notez API tokens (`ntez_...`, used by `claude-agent` and the
MCP server) and claude.ai connector OAuth tokens. Both are random values stored as hashes, not
signed with these secrets.

## ENCRYPTION_KEY

Used by `backend/src/utils/encryption.ts`: AES-256-GCM, key derived with PBKDF2 (per-value salt)
from the **first 32 characters** of `ENCRYPTION_KEY`. Encrypted columns:
`user_ai_settings.encrypted_api_key`, `webhooks.encrypted_secret`,
`webhooks.encrypted_previous_secret`. On 2026-10-11: 1 AI settings row, 1 webhook, 0 previous
secrets.

Traps:
- **A new key without re-encryption silently breaks stored data.** GCM fails the auth tag, so
  `decrypt()` throws: AI calls fail for that user, and the webhook worker cannot sign, so every
  delivery fails and the webhook auto-disables after 50 consecutive failures.
- **Only the first 32 characters count.** The current value is 64 characters; a "rotation" that
  keeps the first 32 changes nothing. Generate a fresh value; length 64 is fine, 32 is enough.
- There is **no re-encryption tool in the repo yet**.

Choose a path:

- **A. Re-encrypt (keeps the data).** Needs a one-off script, not yet written: inside the backend
  image, with `ENCRYPTION_KEY_OLD` and `ENCRYPTION_KEY` both injected, decrypt every value in the
  three columns with the old key and write it back encrypted with the new key, in one
  transaction, aborting on the first failure. Order: back up the DB (`backup-notez.sh`), write the
  new value to Infisical (`secrets_set_random` `NOTEZ_ENCRYPTION_KEY`, folder `infra`, length 64),
  **pause the cron**, **stop `notez-backend`** (`docker compose -f compose.prod.yml -p notez
  stop notez-backend`: any AI-key save or webhook change made while the script runs would be
  written under the OLD key and lost at the switch), run the script as the only writer and check
  its re-encrypted count equals the row count, regenerate and `--apply` the `.env`,
  `docker compose -f compose.prod.yml -p notez up -d notez-backend`, restore the cron.
- **B. Re-enter (loses the stored values; fine at today's counts).** Tell the affected users,
  rotate the key (Infisical, regenerate, `--apply`), then: each user with AI settings saves their
  provider key again in Settings; each webhook owner rotates the webhook secret (which re-encrypts
  it with the new key) and updates the receiving side. Clear `encrypted_previous_secret` rows
  first if any exist.

Prove: an AI action works for the user who has settings; a webhook test delivery succeeds; the
backend log shows no decrypt errors. Old key dead: it only ever decrypted local data, so it is dead
once no row is encrypted under it (path A: the script's count; path B: every row re-saved).

## POSTGRES_PASSWORD

The `postgres` image applies `POSTGRES_PASSWORD` **only when it initialises an empty data
directory**. Changing the env var changes nothing in the existing database. The backend reads it
through `DATABASE_URL`, which compose builds from it.

1. Write the new value: `secrets_set_random` `NOTEZ_POSTGRES_PASSWORD`, folder `infra`,
   length 32, `alnum`.
2. Inject and dry run: the diff must show only `POSTGRES_PASSWORD` changed.
3. **Pause the cron.** From the `--apply` on, a cron run would recreate the backend with the new
   `DATABASE_URL` before the role has the new password: its entrypoint migration fails and it
   restart-loops. Steps 4 to 6 are one window; restore the cron after step 6.
4. Inject and `install-env.sh <file> --apply` (the old file stays as `.env.prev`).
5. Set the role's password **inside** the database without the value touching a command line: on
   accserver, a small script reads `POSTGRES_PASSWORD` from the new `.env` with the same
   split-on-first-`=` parse as `envkeys` (never printing it), builds
   `ALTER ROLE notez WITH PASSWORD '<value>';` in a variable and pipes it to
   `docker exec -i notez-db psql -U notez -d notez -q`. Prefix it in the same session with
   `SET log_statement = 'none'; SET log_min_duration_statement = -1;` (`notez` is a superuser,
   so a session-level SET works) so the cleartext cannot reach the server log whatever the
   global settings are. First confirm `pg_stat_statements` is not installed (it stores utility
   statements with the literal): on 2026-10-11 it was absent, `shared_preload_libraries` empty,
   `log_statement` `none`, `log_min_duration_statement` `-1`. Stronger alternative if any of
   that changes: compute the SCRAM-SHA-256 verifier client-side and `ALTER ROLE ... PASSWORD
   'SCRAM-SHA-256$...'`, so only the verifier is ever sent.
6. `docker compose -f compose.prod.yml -p notez up -d notez-db notez-backend`, so the db
   container's env matches as well (otherwise only stale, but it would matter if the data
   directory were ever re-initialised).
7. Prove new works: `/health` is 200 and the app loads notes.
8. **Prove old dead, over the network, with a control.** `pg_hba` trusts `127.0.0.1`, `::1`
   and the local socket, so any test from inside `notez-db` proves nothing. Test from another
   container on `notez_notez-network` (scram-sha-256 applies there), with the password supplied
   through a mode-600 `PGPASSFILE`, never on the command line:
   - old password (from `.env.prev`): must fail with `password authentication failed`;
   - a garbage password: must fail the same way (control: the test can fail);
   - new password: must succeed (control: the test can pass).
9. `shred -u /datapool/docker/notez/.env.prev`; drift check all `ok`.

`backup-notez.sh` uses `docker exec notez-db pg_dump -U notez` over the trusted local socket, so
backups keep working throughout.

## JWT_REFRESH_SECRET and COOKIE_SECRET (rotate together)

The refresh token is a JWT signed with `JWT_REFRESH_SECRET`, delivered in a cookie signed with
`COOKIE_SECRET` (`@fastify/cookie`), and stored hashed in `sessions`. Either change invalidates
every session (10 live on 2026-10-11): **everyone is signed out** and signs in again. Changing
`COOKIE_SECRET` also fails any SSO login or account-link that is mid-flight (10-minute and
5-minute signed cookies). Rotate both in one window so users are signed out once, not twice.

1. Tell Pam (and anyone else) when; pick a quiet time.
2. `secrets_set_random` `NOTEZ_JWT_REFRESH_SECRET` and `NOTEZ_COOKIE_SECRET`, folder `infra`,
   length 64.
3. Inject, dry run (diff shows exactly those two keys), inject, `--apply`, then
   `docker compose -f compose.prod.yml -p notez up -d notez-backend` rather than waiting for cron.
4. Prove new works: sign in with a password and with Pocket ID; a page refresh after the access
   token expires keeps you signed in (refresh path works).
5. Prove old dead: a browser session from before the rotation is sent to the login page on its
   next refresh. Control: a session created after the rotation survives the same refresh.
6. Optional cleanup: `DELETE FROM sessions WHERE created_at < '<rotation time>';` (the rows are
   already useless; this just removes them).

## JWT_ACCESS_SECRET

Signs the 1-hour access token. After a change every access token fails verification, the
frontend's 401 interceptor calls `/api/auth/refresh` with the (still valid) refresh cookie and
gets a new one, so users should see at most a retried request, not a sign-out. I am inferring
the "no sign-out" part from `frontend/src/lib/api.ts`; the collaboration WebSocket also
authenticates with the access token and is expected to reconnect after refresh. The first
rotation confirms it.

Steps: `secrets_set_random` `NOTEZ_JWT_ACCESS_SECRET` (infra, 64), inject, dry run, `--apply`,
`up -d notez-backend`. Prove: an open tab keeps working (notes load, a collaborative note
reconnects); an access token captured before the rotation now gets 401 (control: a fresh token
gets 200).

## MINIO_SECRET_KEY

The MinIO root password (`MINIO_ROOT_PASSWORD`; the root user is the compose default `notez`),
also used by the backend as its S3 secret key. Both containers read it only at start, and the cron
recreates only the backend, so after `--apply` the backend has the new key and MinIO the old one
until MinIO is recreated: image upload and display fail in that window.

1. Back up first (`backup-notez.sh` copies `minio/`).
2. `secrets_set_random` `NOTEZ_MINIO_SECRET_KEY` (infra, 64), inject, dry run, inject,
   `--apply`, then immediately
   `docker compose -f compose.prod.yml -p notez up -d notez-minio notez-backend`.
3. I am inferring that current MinIO releases accept a changed root password on an existing data
   directory with no migration (older releases encrypted config with the root credentials and
   needed `MINIO_ROOT_USER_OLD` / `MINIO_ROOT_PASSWORD_OLD`). Confirm against the MinIO docs for
   the running image version before starting, and check `docker logs notez-minio` after.
4. Prove new works: `notez-minio` healthy; an existing image displays; a new upload works.
5. Prove old dead: an S3 request signed with the old key (e.g. `mc alias set` with credentials
   from `.env.prev` via a mode-600 file, from a container on `notez_notez-network`) is refused
   with `SignatureDoesNotMatch`/`InvalidAccessKeyId`; control: the new key succeeds.

(homelab-docs has a MinIO replacement plan for accserver; if MinIO is replaced first, this section
moves with it.)

## RESEND_API_KEY

Minted by Resend, so it is the one value here that a person has to create.

1. Adam creates a new API key in the Resend dashboard (sending access, domain `cogg.haus`) and
   saves it straight into a file in a scratch dir, never into chat.
2. `secrets_set_from_file` `NOTEZ_RESEND_API_KEY`, folder `external` (shreds the file).
3. Inject, dry run, inject, `--apply`, `up -d notez-backend`.
4. Prove new works: request a password reset for a test account; the mail arrives (Resend log
   shows it delivered).
5. Revoke the old key in the Resend dashboard. Prove old dead: an authenticated Resend API call
   with the old key (from `.env.prev`, via a file, through `secrets_run`-style redaction) returns
   401; control: the new key returns 200 on the same call.

## OIDC_CLIENT_SECRET (Pocket ID)

Follow the `pocket-id` skill's Rotation section: `POST /oidc/clients/{id}/secrets` adds a second
active secret, store it with `secrets_set_from_file` as `NOTEZ_POCKET_OIDC_CLIENT_SECRET`
(folder `oidc`), inject, dry run (only `OIDC_CLIENT_SECRET` changes), inject, `--apply`,
`up -d notez-backend`, run the skill's control test (bogus
code with the new secret gives `invalid_grant`; garbage secret gives `invalid_client`), sign in
with Pocket ID, then deactivate the old secret in Pocket ID and repeat the control test with the
old secret: `invalid_client` proves it dead. No user is signed out: existing Notez sessions do not
depend on the client secret.

## After any rotation

- Drift check: every key `ok`, compose `ok`, `.env` 600 adam.
- `shred -u /datapool/docker/notez/.env.prev` once the old value is proven dead.
- Record the date and secret in the homelab audit log if the rotation was leak-driven (homelab
  change checklist, section 8: numbered ROTATION TIER entry in `audit\STATUS.md`).

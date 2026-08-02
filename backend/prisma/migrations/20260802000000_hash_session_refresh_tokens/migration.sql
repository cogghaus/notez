-- Store only a SHA-256 digest of session refresh tokens.
--
-- Refresh tokens were previously persisted in plaintext, so read access to the
-- database yielded directly replayable credentials for /api/auth/refresh.
--
-- Existing rows hold the raw tokens and cannot be hashed in place without
-- pgcrypto, and carrying them over would defeat the point of the change, so all
-- sessions are cleared. Effect on deploy: every user is signed out once and logs
-- in again. Access tokens already expire in an hour, so this is a small window.

DELETE FROM "sessions";

DROP INDEX IF EXISTS "sessions_refresh_token_key";

ALTER TABLE "sessions" DROP COLUMN "refresh_token";

ALTER TABLE "sessions" ADD COLUMN "refresh_token_hash" VARCHAR(64) NOT NULL;

CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

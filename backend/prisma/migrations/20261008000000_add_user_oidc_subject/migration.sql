-- Pocket ID (OIDC) single sign-on: link a Notez user to the IdP subject.
-- Additive and nullable: existing rows are untouched.
ALTER TABLE "users" ADD COLUMN "oidc_subject" VARCHAR(255);

CREATE UNIQUE INDEX "users_oidc_subject_key" ON "users"("oidc_subject");

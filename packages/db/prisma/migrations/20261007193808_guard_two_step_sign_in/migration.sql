-- Guard: two-step sign-in on a person's sign-in record (spec/acceptance/10-api-and-sync.md
-- AC-10-11, 26; spec/THREAT-MODEL.md T-14, T-16, T-43; ARCHITECTURE §6; ADR-113, 170, 397, 412;
-- BACKLOG 2.2.4). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The column and the two kinds of security event are the migration before this one. The table's
-- own guards (its grants, its audit with the secret kept out, no delete) already hold them.
-- Three rules are added.

-- 1. An authenticator's secret is only ever kept sealed by the API (a version, then the three
-- parts of an AES-256-GCM sealing, each in URL-safe base64), never as the secret an app is
-- given: the key that opens it is the API's own and is not in the database (NIST SP 800-63B-4
-- §3.1.4.2: the verifier's copy of the key is strongly protected).
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_two_step_sealed_check" CHECK (
  "two_step_secret" ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);

-- 2. The step of the last code taken is never below nought.
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_two_step_last_step_check" CHECK (
  "two_step_last_step" >= 0
);

-- 3. It belongs to the secret: with no authenticator set up there is no last code, so clearing
-- one clears both, and the next one set up starts afresh.
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_two_step_together_check" CHECK ((
  "two_step_last_step" IS NULL OR "two_step_secret" IS NOT NULL
) IS TRUE);

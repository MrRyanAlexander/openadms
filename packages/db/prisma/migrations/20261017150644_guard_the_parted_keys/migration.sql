-- Guard: one key a purpose, and the master passcode's own offline seed (spec/THREAT-MODEL.md
-- T-02, T-43; spec/acceptance/10-api-and-sync.md AC-10-109; ARCHITECTURE §5.1…§5.3, §6, §7.5;
-- ADR-097, 113, 411, 412, 454, 542; the Phase 2 audit's F3 and F11). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The column is the migration before this one. The API now holds three secrets, each for one
-- purpose: its signing secret, a password key and a sealing key. What it seals is now sealed
-- under the sealing key (`v2`), and what it sealed before under a key drawn from the signing secret
-- (`v1`) is opened and sealed again at its owner's next sign-in. The master passcode keeps its
-- own offline seed beside its verifier: what a phone's check is made from, and a sign-in made
-- offline under it is proven against, so the verifier itself is never a credential. Now:
--   1. an authenticator's secret and a monitor's offline seed are sealed `v1` or `v2`;
--   2. the master passcode's offline seed is only ever what the API sealed (`v2`), and stays out
--      of the audit log as its hash does;
--   3. the API may write a version's offline seed once, where it has none, and make the
--      installer's verifier keyed with the password key, once; never anything else of a version.

-- 1.
ALTER TABLE "user_credential" DROP CONSTRAINT "user_credential_two_step_sealed_check";
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_two_step_sealed_check" CHECK (
  "two_step_secret" ~ '^v[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);
ALTER TABLE "user_credential" DROP CONSTRAINT "user_credential_offline_seed_sealed_check";
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_offline_seed_sealed_check" CHECK (
  "offline_seed" ~ '^v[12]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);

-- 2. The trigger is made again to name the column; nothing is written between the two.
ALTER TABLE "master_passcode" ADD CONSTRAINT "master_passcode_offline_seed_sealed_check" CHECK (
  "offline_seed" ~ '^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);
DROP TRIGGER "master_passcode_audit" ON "master_passcode";
CREATE TRIGGER "master_passcode_audit" AFTER INSERT OR UPDATE ON "master_passcode"
  FOR EACH ROW EXECUTE FUNCTION audit_capture('SECURITY', 'hash', 'offline_seed');

-- 3. The two columns alone, and only the one way each. The grant is the table's, as for every
-- table the API may write (guard_gaps() asks that a table it may update be updatable whole); the
-- trigger refuses everything else, so what a version is, and when it was made, never changes.
GRANT UPDATE ON "master_passcode" TO adms_api;

CREATE FUNCTION master_passcode_kept_once_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'A master passcode''s version is never edited: a passcode changed is a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."offline_seed" IS DISTINCT FROM OLD."offline_seed"
    AND (OLD."offline_seed" IS NOT NULL OR NEW."offline_seed" IS NULL) THEN
    RAISE EXCEPTION 'A master passcode''s offline seed is written once, where it has none, and never changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."hash" IS DISTINCT FROM OLD."hash"
    AND (OLD."hash" ~ ',keyid=djI\$' OR NEW."hash" !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+,keyid=djI\$') THEN
    RAISE EXCEPTION 'A master passcode''s verifier is only ever keyed, once: a passcode changed is a new version'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "master_passcode_kept_once" BEFORE UPDATE ON "master_passcode"
  FOR EACH ROW EXECUTE FUNCTION master_passcode_kept_once_guard();

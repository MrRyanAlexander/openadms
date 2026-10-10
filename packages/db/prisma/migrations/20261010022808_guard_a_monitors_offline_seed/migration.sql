-- Guard: a monitor's offline seed, and which version of the master passcode's check a phone
-- holds (spec/DATA-MODEL.md §2.2; spec/acceptance/02-people-and-devices.md AC-02-17, AC-02-41;
-- spec/acceptance/10-api-and-sync.md AC-10-11; ARCHITECTURE §5.1…§5.3, §7.2, §7.5; ADR-097,
-- 113, 139, 412, 440, 449 (5), 454; BACKLOG 2.5.3, C21, C117). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The column is the migration before this one. A phone's login-list entry for a monitor is made
-- from their offline seed, which the API keeps sealed beside the password's hash. Now:
--   1. the audit log says that a seed changed, never what from or to, as it does of the hash;
--   2. a seed is only ever what the API sealed, and is kept only where a password is;
--   3. a seed never outlives the password it was made from: a password set anew takes a new
--      seed, or none;
--   4. which version of the master passcode's check a phone holds is said only by that phone's
--      own proven call, and never goes back to an earlier version.

-- 1. The trigger is made again to name the column; nothing is written between the two.
DROP TRIGGER "user_credential_audit" ON "user_credential";
CREATE TRIGGER "user_credential_audit" AFTER INSERT OR UPDATE ON "user_credential"
  FOR EACH ROW EXECUTE FUNCTION audit_capture(
    'SECURITY', 'password_hash', 'two_step_secret', 'offline_seed'
  );

-- 2.
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_offline_seed_sealed_check" CHECK (
  "offline_seed" ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
);
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_offline_seed_together_check" CHECK ((
  "offline_seed" IS NULL OR "password_hash" IS NOT NULL
) IS TRUE);

-- 3.
CREATE FUNCTION user_credential_offline_seed_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."offline_seed" IS NOT NULL
    AND NEW."password_hash" IS DISTINCT FROM OLD."password_hash"
    AND NEW."offline_seed" IS NOT DISTINCT FROM OLD."offline_seed" THEN
    RAISE EXCEPTION 'An offline seed never outlives its password: a password set anew takes a new seed, or none'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "user_credential_offline_seed" BEFORE UPDATE ON "user_credential"
  FOR EACH ROW EXECUTE FUNCTION user_credential_offline_seed_guard();

-- 4. A phone is enrolled under the version in force (the foreign key says it exists). From then
-- on the version is moved only by the device key's actor for that same phone, when the phone is
-- sent the check of a later version.
CREATE FUNCTION device_master_passcode_version_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."master_passcode_version" IS NOT DISTINCT FROM OLD."master_passcode_version" THEN
    RETURN NEW;
  END IF;
  IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."id"::text THEN
    RAISE EXCEPTION 'Only a phone''s own proven call says which version of the master passcode''s check it holds'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."master_passcode_version" < OLD."master_passcode_version" THEN
    RAISE EXCEPTION 'A phone never goes back to an earlier version of the master passcode''s check'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "device_master_passcode_version" BEFORE UPDATE ON "device"
  FOR EACH ROW EXECUTE FUNCTION device_master_passcode_version_guard();

-- Guard: a session opened under the master passcode (spec/DATA-MODEL.md §2.2; spec/acceptance/
-- 02-people-and-devices.md AC-02-42; ARCHITECTURE §5.1…§5.4, §6 (Device sessions), §7.2, §7.3,
-- §7.5; ADR-095, 105, 113, 120, 438, 443, 456 (3)(d), (5)(d), 462; BACKLOG 2.5.4, C113, C122;
-- REQ-202b). Written by hand into Prisma's --create-only stub; never edited once applied.
--
-- The column and its closed set are the migration before this one. A monitor's session on a
-- phone keeps its guards (ADR-443): it names a phone in service whose key stands, for a monitor
-- who isn't archived, and the phone never changes. Now:
--   1. only a session on a phone is marked as opened under the master passcode;
--   2. a session on a phone is opened one of two ways and says which: by the monitor's own
--      sign-in, unmarked and written as that monitor from that phone; or under the master
--      passcode, marked and written as the master passcode's actor for that phone. So nobody
--      can write a passcode's session that reads as the monitor's own sign-in, nor the reverse;
--   3. how a session was opened never changes.

-- 1.
ALTER TABLE "session" ADD CONSTRAINT "session_master_passcode_session_check" CHECK (
  "master_passcode_session" IS NULL OR "device_id" IS NOT NULL
);

-- 2. Asked when a session is opened: the function of ADR-443's guard, with who may write which.
CREATE OR REPLACE FUNCTION session_on_a_phone_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  person_role text;
  person_archived timestamptz;
  phone record;
BEGIN
  SELECT "role"::text, "archived_at" INTO person_role, person_archived
    FROM "user" WHERE "id" = NEW."user_id";
  IF NEW."device_id" IS NULL THEN
    IF person_role = 'MONITOR' THEN
      RAISE EXCEPTION 'A monitor signs in on a phone only: their session names the phone'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF person_role IS DISTINCT FROM 'MONITOR' OR person_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Only a monitor in service signs in on a phone'
      USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT "status"::text AS status, "key_revoked_at" INTO phone
    FROM "device" WHERE "id" = NEW."device_id";
  IF phone.status IS DISTINCT FROM 'ACTIVE' OR phone.key_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'A phone out of service signs nobody in'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."master_passcode_session" IS NULL THEN
    IF nullif(current_setting('adms.actor_id', true), '') IS DISTINCT FROM NEW."user_id"::text
      OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
      OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
      RAISE EXCEPTION 'A monitor''s session is opened by their own sign-in, on that phone'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF nullif(current_setting('adms.actor_id', true), '')
      IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'
    OR nullif(current_setting('adms.source', true), '') IS DISTINCT FROM 'DEVICE'
    OR nullif(current_setting('adms.device_id', true), '') IS DISTINCT FROM NEW."device_id"::text THEN
    RAISE EXCEPTION 'A session under the master passcode is opened as the master passcode''s actor, on that phone'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- 3.
CREATE TRIGGER "session_refuse_master_passcode_session_edit" BEFORE UPDATE OF "master_passcode_session"
  ON "session" FOR EACH ROW EXECUTE FUNCTION refuse_edit();
